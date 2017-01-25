var express = require('express');
const _ = require('lodash');
var bodyParser = require('body-parser');

var bookshelf = require('./bookshelf');
const bot = require('./bot');
const errors = require('./errors');
const handlers = require('./handlers');

const TaskTemplate = require('./models/task-template');
const Volunteer = require('./models/volunteer');
const Task = require('./models/task');
const Admin = require('./models/admin');
const Beacon = require('./models/beacon');

const Promise = require('bluebird');

var router = express.Router();

// Creates a new volunteer.
router.post('/consent', bodyParser.urlencoded({extended: true}), function(req, res, next) {
	const vol = {
		fbid: req.body.fbid,
		consentDate: new Date(),
	}
	bot.getProfile(req.body.fbid, (err, profile) => {
		if (!err) {
			vol.firstName = profile.first_name
			vol.lastName = profile.last_name
		} else {
			console.log(err)
		}
		return new Volunteer().save(vol).then(() => {
			res.send('<h1>Thanks! Please press the cancel button to return to the bot chat.</h1>')
			handlers.sendDeploymentMessage(req.body.fbid)
		})
		.catch(next)
	})
})

router.post('/webhook', bodyParser.urlencoded({extended: true}), function(req,res,next) {
	if (!req.body.wid || !req.body.message) {
		return res.status(400).send('message and wid are required');
	}
	handlers.handleWebhook(req).then(function(err) {
		if (!err) {
			res.send('OK');
		} else {
			res.status(400).send(err);
		}
	})
});

// Batch add tasks.
router.post('/tasks', bodyParser.json(), function(req, res, next) {
	let templates = _.uniq(_.map(req.body, 'template_type'))
	TaskTemplate.collection()
	.query('where', 'type', 'in', templates)
	.fetch()
	.then(function(models) {
		return models.reduce((acc, t) => {
			acc[t.get('type')] = t
			return acc
		}, {})
	})
	.then(function(templates) {
		let ps = req.body.map(function(task) {
			if (!(task.template_type in templates)) {
				throw new errors.BadRequestError(`No template named ${task.template_type}`)
			}
			let template = templates[task.template_type]
			const params = _.omit(task,
				['template_type', 'deployment_id', 'dependencies']
			)
			return new Task({
				instructionParams: JSON.stringify(params),
				estimatedTime: template.get('estimatedTime'),
				deploymentId: task.deployment_id,
				completedWebhook: template.get('completedWebhook'),
				templateType: task.template_type,
			}).save()
		})
		return Promise.all(ps)
	})
	.then(results => {
		res.status(201).send(results.map(r => r.serialize()))
	})
	.catch(next)
})

// Upload sweep data
router.post('/sweep-data', bodyParser.urlencoded({extended: true}), function(req, res, next) {
	console.log("got sweep data", req.body);
	let now = Date.now();
	let missing = req.body.missing ? req.body.missing.split(",").map(Number) : [];
	let present = req.body.present ? req.body.present.split(",").map(Number) : [];
	let a = Beacon.collection().query('where', 'id', 'in', missing).fetch()
	.then(function(beacons) {
		if (beacons) {
			return Promise.map(beacons, function(beacon) {
				return beacon.save({
					lastSwept: now,
					exists: false
				}, {method: "update"})
				.then(function(beacon) {
					return Task.forge({
						deploymentId: 1,
						templateType: "replace_beacon",
						slot: beacon.get('slot')
					}).save(null, {method: 'insert'});
				})
			});
		}
	});
	let b = Beacon.collection().query('where', 'id', 'in', present).fetch()
	.then(function(beacons) {
		if (beacon) {
			return Promise.map(beacons, function(beacon) {
				return beacon.save({
					lastSeen: now,
					lastSwept: now,
					exists: true
				}, {method: "update"});
			});
		}
	});
	Promise.all([a,b]).then(function() {
		res.sendStatus(200);
	}).catch(function(err) {
		console.log(err);
		res.sendStatus(500);
	})
})

module.exports = router