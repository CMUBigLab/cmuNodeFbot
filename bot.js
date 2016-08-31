const Bot = require('messenger-bot')
const http = require('http')
const express = require('express')
var bodyParser = require('body-parser')

const cli = require('./cli')
const handlers = require('./handlers')
const routes = require('./routes')
const Admin = require('./models/admin')
const errors = require('./errors')

// TODO(cgleason): this file is a mess. Interactive mode should actually
// just talk to the real bot without all of this other nonsense

process.on('unhandledRejection', function(error, promise) {
	console.error("UNHANDLED REJECTION", error.stack)
	Admin.sendError(error)
})

function expressErrorHandler(err, req, res, next) {
	// log error
	console.log(err);
	Admin.sendError(err);
	if (err instanceof errors.BadRequestError) {
		res.status(400).send({error: err.message});
	} else {
		res.status(500).end();
	}
}

module.exports = {
	sendMessage: function(message) { return; },
}

if (require.main === module) {
	let bot = null
	if (cli.interactive) {
		bot = require('./interactive').instance
		module.exports.sendMessage = bot.sendMessage.bind(bot)
	} else {
		bot = new Bot({
			token: process.env.PAGE_ACCESS_TOKEN,
			verify: process.env.VERIFY_TOKEN,
			app_secret: process.env.APP_SECRET,
		})

		bot.on('error', (err) => {
			console.log(err.message)
		})

		let ignoring = {}

		bot.on('message', (payload, reply) => {
			if (ignoring[payload.message.sender.id]) {
				console.log(`ignoring message from ${payload.sender.id}`)
				return
			}
			if (payload.message.is_echo) {
				let msg = payload.message.text
				if (msg && msg.startsWith('bot:')) {
					if (msg.slice(4) == "on") {
						delete ignoring[payload.message.recipient.id]
					} else if (msg.slice(4) == "off") {
						ignoring[payload.message.recipient.id] = true
					} else {
						console.log(`invalid command ${msg}`)
					}
				}
				return
			}
			if (!payload.message.text) {
				reply({text: "Sorry, I only handle text messages right now."})
				return
			}
			bot.getProfile(payload.sender.id, (err, profile) => {
				if (err) console.log(err)
				payload.sender.profile = profile
				handlers.dispatchMessage(payload, reply)  
			})
		})

		bot.on('postback',  (payload, reply) => {
			bot.getProfile(payload.sender.id, (err, profile) => {
				if (err) throw err
				payload.sender.profile = profile
				handlers.dispatchPostback(payload, reply)
			})
		})

		module.exports.sendMessage = bot.sendMessage.bind(bot)
		module.exports.getProfile = bot.getProfile.bind(bot)

		bot.startListening = function() {
			var app = express()
			app.use(express.static(__dirname + '/static'))
			app.use(bodyParser.urlencoded({extended: true}))
			app.use(bodyParser.json())
			app.use(routes)
			app.use(expressErrorHandler)
			app.use(bot.middleware())
			var server = app.listen(process.env.PORT || 3000, () => {
				console.log(`Echo bot server running at port ${server.address().port}.`)
			})
		}
	}

	bot.startListening()
}