import { BaseModel } from "./base";
import * as _ from "lodash";
import * as Promise from "bluebird";

import * as msgUtil from "../message-utils";
import bookshelf = require("../bookshelf");
import {Volunteer} from "./volunteer";
import {Task} from "./task";

export class Deployment extends BaseModel<Deployment> {
    get tableName() { return "deployments"; }
    volunteers() {
        return this.hasMany(Volunteer);
    }

    tasks() {
        return this.hasMany(Task);
    }

    get active(): boolean { return this.get("active"); }
    get name(): string { return this.get("name"); }
    get type(): string { return this.get("type"); }
    get supplyStation(): string { return this.get("supply_station"); }
    get supplyStationInstructions(): string { return this.get("supply_station_instructions"); }
    get mapFilename(): string { return this.get("map_filename"); }

    distributeTasks() {
        return this.volunteers()
        .query({where: {current_task: null}})
        .fetch()
        .then(volunteers => {
            volunteers.forEach((v) => (v as Volunteer).getNewTask());
        });
    }

    checkThresholds() {
        return this.volunteers().fetch({withRelated: ["currentTask"]})
        .then(function(volunteers) {
            volunteers.forEach((v: Volunteer) => {
                let t = v.related<Task>("currentTask") as Task;
                if (t && t.startTime && !t.completed) {
                    if (v.currentTask().timeScore() < 0 && v.currentTask().timeScore() > -1) {
                        let text = "You didn't finish your task in the estimated thim period. Do you need help?";
                        let buttons = [{type: "postback", title: "Yes, please send someone.", payload: "{\"type\":\"send_mentor\",\"args\":{}}"}];
                        v.sendMessage(msgUtil.buttonMessage(text, buttons));
                    } else if (t.timeScore() < -1) {
                        v.sendMessage({text: "You haven't finished your task in more that twice the estimated time it would take. We are going to send someone to help you."});
                        return v.createMentorshipTask();
                    }
                }
            });
        });
    }

    start() {
        return this.save({start_time: new Date(), active: true});
    }

    sendSurvey(vol: Volunteer) {
        let buttons = [{
            type: "web_url",
            url: `https://docs.google.com/forms/d/e/1FAIpQLSfkJZb1GOGR1HfC8zw2nipkl3yi_-7cDbUNvigl2PjqLxhbqw/viewform?entry.2036103825=${vol.fbid}`,
            title: "Open Survey"
        }];
        let text = "I am work-in-progress, so please help me become a better bot by answering this quick survey!";
        return vol.sendMessage(msgUtil.buttonMessage(text, buttons));
    }

    finish() {
        return this.volunteers().fetch().then(volunteers => {
            // volunteers.forEach((v) => {
            // 	v.sendMessage({text: "Thank you very much!\nYou just helped make CMU accessible."})
            // 	this.sendSurvey(v)
            // })
            return this.save({done_time: new Date()});
        });
    }

    isComplete() {
        return this.tasks()
        .query({where: {completed: false}}).count()
        .then(count => false); // (count == 0))
    }

    get isCasual() {
        return this.type === "casual" || this.type === "semiCasual";
    }
}