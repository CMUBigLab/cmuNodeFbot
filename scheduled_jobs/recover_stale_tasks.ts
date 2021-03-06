import * as Promise from "bluebird";
import * as moment from "moment";

import {DATE_FORMAT} from "../config";
import {bot} from "../bot";
import {Task, Volunteer} from "../models";

const DEPLOYMENT_ID = 3; // TODO: should not hardcode this, should be set on table?

export function recoverUnstartedTasks() {
    return Task.collection().query((qb) => {
        qb.whereNotNull("volunteer_fbid")
        .where("completed", false)
        .where("deployment_id", DEPLOYMENT_ID)
        .whereNull("start_time");
    }).fetch({withRelated: ["assignedVolunteer"]})
    .then(tasks => {
        return Promise.all(tasks.map((task: Task) => {
                let vol: Volunteer = task.related<Volunteer>("assignedVolunteer") as Volunteer;
                let cutoff = moment().subtract(6, "hours");
                let messaged = vol.lastMessaged == null || moment(vol.lastMessaged).isBefore(cutoff);
                let response = vol.lastResponse == null || moment(vol.lastResponse).isBefore(cutoff);
                if (messaged && response) {
                    return vol.unassignTask();
                } else return null;
            }));
        });
    }

export function prodStartTasks() {
    return Task.collection().query((qb) => {
        qb.whereNotNull("volunteer_fbid")
        .where("completed", false)
        .where("deployment_id", DEPLOYMENT_ID)
        .whereNotNull("start_time")
        .whereNull("completed_time");
    }).fetch({withRelated: ["assignedVolunteer"]})
    .then(tasks => {
        return Promise.all(tasks.map((task: Task) => {
                let vol: Volunteer = task.related<Volunteer>("assignedVolunteer") as Volunteer;
                let cutoff = moment().subtract(6, "hours");
                let messaged = vol.lastMessaged == null || moment(vol.lastMessaged).isBefore(cutoff);
                let response = vol.lastResponse == null || moment(vol.lastResponse).isBefore(cutoff);
                if (messaged && response) {
                    const date = moment(task.startTime).format("MMMM Do YYYY");
                    return vol.sendMessage({text: `Hi, you started a task on ${date}. If you can't finish it, you can 'reject' the task so others may complete it. You can also ask for 'help' if you need it.`});
                } else return null;
            }));
        });
}