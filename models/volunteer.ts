import * as _ from "lodash";
import * as Promise from "bluebird";
import * as moment from "moment";

import {bot} from "../app";
import * as handlers from "../handlers";
import bookshelf = require("../bookshelf");
import * as msgUtil from "../message-utils";
import {Deployment} from "./deployment";
import {Task} from "./task";

export class Volunteer extends bookshelf.Model<Volunteer> {
    get tableName() { return "volunteers"; }
    get idAttribute() { return "fbid"; }
    currentTask() {
        return this.belongsTo(Task, "current_task");
    }
    deployment() {
        return this.belongsTo(Deployment);
    }
    assignTask(task) {
        return Promise.all([
            this.save({currentTask: task.id}, {patch: true}),
            task.save({volunteer_fbid: this.id}, {patch: true})
        ]);
                    // if (deployment.isCasual) {
                    // 	let buttons = [{
                    // 		type: "postback",
                    // 		title: "Yes, accept task.",
                    // 		payload: JSON.stringify({
                    // 			type: "accept_task",
                    // 			args: {}
                    // 		})
                    // 	},{
                    // 		type: "postback",
                    // 		title: "I can't do this now.",
                    // 		payload: JSON.stringify({
                    // 			type: "reject_task",
                    // 			args: {}
                    // 		})
                    // 	}]
                    // 	let text = `This task should take ${task.estimatedTimeMin} minutes. Do you have time to do it now?`
                    // 	setTimeout(msgFn, (currWait+2)*1000, msgUtil.buttonMessage(text, buttons))
                    // } else {
                    // 	setTimeout(msgFn, (currWait+1)*1000, {text: `This task should take ${task.estimatedTimeMin} minutes. If you don't want to do the task, reply with 'reject'.`})
    }
    getNewTask() {
        return this.deployment().fetch()
        .then(deployment => {
            return [deployment, deployment.doesAnyoneNeedHelp(this)];
        })
        // if someone needs help, add mentorship task
        .spread((deployment: Deployment, task: Task) => {
            if (task) {
                return task;
            } else {
                // otherwise, get normal task, looking for pre-assigned things
                return deployment.getTaskPool()
                .then(pool => {
                    // pool = _.filter(pool, t => t.allowedToTake(this))
                    //const preAssigned = _.find(pool, (p: typeof bookshelf.Model) => {
                    //    return p.get("volunteerFbid") === this.get("fbid");
                    //});
                    //if (preAssigned) {
                    //    return preAssigned;
                    //} else
                    if (pool.length > 0) {
                        return pool.pop();
                    } else {
                        return null;
                    }
                });
            }
        });
    }
    getAverageExpertise() {
        return Task.collection()
        .query({
            volunteer_fbid: this.get("fbid"),
            completed: true
        })
        .query("where", "score", "is not", null)
        .fetch()
        .then(tasks => {
            const total = _.sum(tasks.map(t => t.get("score")));
            return tasks.length ? total / tasks.length : 0;
        });
    }
    getAverageTime() {
        return Task.collection()
        .query({
            volunteer_fbid: this.get("fbid"),
            completed: true
        }).query("where", "completed_time", "is not", null)
        .query("where", "start_time", "is not", null)
        .fetch()
        .then(tasks => {
            const total = _.sum(tasks.map(t => t.get("timeScore")));
            return tasks.length ? total / tasks.length : 0;
        });
    }
    completeTask() {
        return this.save({currentTask: null}, {patch: true});
    }
    unassignTask() {
        return this.currentTask().fetch()
        .then((task) => {
            return Promise.all([
                this.save({currentTask: null}, {patch: true}),
                task.save({volunteer_fbid: null, startTime: null, taskState: null}, {patch: true})
            ]);
        });
    }
    getMentorshipTask() {
        return new Task().query(qb => {
            qb.where("template_type", "=", "mentor")
            .andWhere("completed", "=", false)
            .andWhere(
                "instruction_params",
                "@>",
                JSON.stringify({mentee: {fbid: this.get("fbid")}})
            );
        })
        .fetch();
    }
    createMentorshipTask() {
        return this.currentTask().fetch().then(task => {
            if (!task) {
                throw new Error("There is no current task!");
            }
            const params = {
                mentee: this.serialize({shallow: true}),
                beacon: undefined
            };
            params.mentee.name = this.name();
            if (task.get("instructionParams").beacon) {
                params.beacon = task.get("instructionParams").beacon;
            } else {
                throw new Error("This task does not support mentorship yet.");
            }
            const Task = bookshelf.model("Task");
            return new Task({
                templateType: "mentor",
                instructionParams: params,
                deploymentId: this.get("deploymentId"),
                estimatedTime: "15 min",
            })
            .save();
        });
    }
    sendMessage(message) {
        bot.sendMessage(this.get("fbid"), message);
    }
    name() {
        return `${this.get("firstName")} ${this.get("lastName")}`;
    }
}
// }, {
//     recoverStaleTasks: () => {
//         let cutoff = moment().subtract(6, "hours").format("YYYY-MM-DD HH:mm:ss");
//         return this.collection().query((qb) => {
//             qb.where(function() {
//                 this.where("last_messaged", "<", cutoff)
//                 .orWhere("last_response", "<", cutoff);
//             }).whereNotNull("current_task");
//         }).fetch()
//         .then(function(vols) {
//             return Promise.map(vols, function(vol) {
//                 .unassignTask()
//                 .then(function(vol) {
//                     return vol.sendMessage({text: "You didn't finish your task, so I have freed it up for others to take."});
//                 });
//             });
//         });
//     }
// });