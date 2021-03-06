let machina = require("machina");
import * as FBTypes from "facebook-sendapi-types";

import * as config from "../config";
import {bot} from "../bot";
import * as msgUtil from "../message-utils";
import {FingerprintPoint, Task} from"../models/";
import {Volunteer} from "../models/volunteer";
import {getAndAssignVolTask} from "../handlers";

function done(task: Task) {
    task.saveScore(15 + 5 * task.context.points.length, 0.125 * task.context.points.length)
    .then(() => {
        this.handle(task, "complete");
    });
}

export const FingerprintTaskFsm = machina.BehavioralFsm.extend({
    namespace: "fingerprint",
    initialState: "ios_check",
    states: {
        ios_check: {
            _onEnter: function(task: Task) {
                return task.assignedVolunteer().fetch()
                .then(vol => {
                    if (vol.hasIOS !== null) {
                        return this.transition(task, "download_app");
                    }
                    const text = "Some of our tasks require the use of a helper app to collect Bluetooth data. Do you have an iOS device?";
                    return vol.sendMessage(msgUtil.quickReplyMessage(text, ["yes", "no"]));
                });
            },
            "msg:yes": function(task: Task) {
                return task.assignedVolunteer().fetch()
                .then((vol: Volunteer) => vol.save({"has_ios": true}))
                .then(() => this.transition(task, "download_app"));
            },
            "msg:no": function(task: Task) {
                return task.assignedVolunteer().fetch()
                .then((vol: Volunteer) => vol.save({"has_ios": false}))
                .then((vol: Volunteer) => {
                    const text = "Unforuntately, we don't have the helper app available for other platforms yet. We will contact you when we do!";
                    return vol.sendMessage({text})
                    .then(() => vol.unassignTask());
                }).then(([vol, oldTask]) => getAndAssignVolTask(vol));
            },
        },
        download_app: {
            _onEnter: function(task: Task) {
                return task.assignedVolunteer().fetch()
                .then(vol => {
                    if (vol.appState === "installed") {
                        return this.transition(task, "how_many");
                    }
                    const text = "You will need to download the app 'LuzDeploy Data Sampler'. Press the link below to open the App Store.";
                    const url = "http://appstore.com/luzdeploydatasampler";
                    const buttons = [{
                        "type": "web_url",
                        "title": "Download App",
                        "url": url,
                        "webview_height_ratio": "compact",
                    }] as Array<FBTypes.MessengerButton>;
                    return bot.FBPlatform.sendButtonMessage(
                        vol.fbid.toString(),
                        text,
                        buttons
                    ).then(() => {
                        const text = "Then come back to this conversation and let me know when you are 'done'!";
                        return vol.sendMessage(msgUtil.quickReplyMessage(text, ["done"]));
                    }); 
                });
            },
            "msg:done": function(task: Task) {
                return task.assignedVolunteer().fetch()
                .then((vol: Volunteer) => vol.save({app_state: "installed"}))
                .then(() => this.transition(task, "how_many"));
            }
        },
        how_many: {
            _onEnter: function(task: Task) {
                let text = "We need you to help us sample beacon data in the building. How many samples would you like to collect (one sample takes about 30 seconds on average)?";
                bot.sendMessage(task.volunteerFbid, msgUtil.quickReplyMessage(text, ['5', '10', '15']));
            },
            number: function(task: Task, n) {
                task.context = {numSamples: n};
                this.transition(task, "load_points");
            }
        },
        load_points: {
            _onEnter: function(task: Task) {
                let self = this;
                FingerprintPoint.getPointsForSampling(
                    task.deploymentId,
                    task.context.numSamples
                ).then(function(points) {
                    task.context.points = points.map((p: FingerprintPoint) => ({
                            floor: p.floor,
                            lat: p.latitude,
                            long: p.longitude
                    }));
                }).then(function() {
                    self.transition(task, "goto");
                });
            }
        },
        goto: {
            _onEnter: function(task: Task) {
                const text = "Please open the LuzDeploy app below and follow the instructions. Let me know when you are 'done'!";
                const locations = task.context.points.map(
                    p => `${p.floor},${p.lat},${p.long}`
                ).join(";");
                const url = `${config.BASE_URL}/redirect.html?type=datasampler&major=65535&locations=${locations}&wid=${task.volunteerFbid}&next=${config.THREAD_URI}&base=${config.BASE_URL}`
                const buttons = [
                    {
                        "type": "web_url",
                        "title": "Open LuzDeploy",
                        "url": url,
                        "webview_height_ratio": "compact",
                        "messenger_extensions": true,
                    }
                ] as Array<FBTypes.MessengerButton>;
                 bot.FBPlatform.sendButtonMessage(task.volunteerFbid.toString(), text, buttons);
            },
            "msg:done": done,
            "webhook:done": done
        },
    },
    getNewTask: function(vol: Volunteer) {
        if (vol.hasIOS === false) {
            return null;
        }
        return FingerprintPoint.getPointsForSampling(vol.deploymentId, 1)
        .then((points) => {
            if (points.length === 0) {
                return null;
            } else {
                return new Task({
                    template_type: "fingerprint",
                    deployment_id: vol.deploymentId
                });
            }
        });
    }
});