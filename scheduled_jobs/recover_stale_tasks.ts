import * as Promise from "bluebird";
import * as moment from "moment";

import {DATE_FORMAT} from "../config";
import {bot} from "../bot";
import {Task, Volunteer} from "../models";

const DEPLOYMENT_ID = 4; // TODO: should not hardcode this, should be set on table?

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
                if (moment(vol.lastMessaged).isBefore(cutoff) &&
                    moment(vol.lastResponse).isBefore(cutoff)) {
                    return vol.unassignTask();
                } else return null;
            }));
        });
    }