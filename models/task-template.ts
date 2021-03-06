import { BaseModel } from "./base";
import * as _ from "lodash";
import * as Promise from "bluebird";
import * as dust from "dustjs-linkedin";
import * as pg from "pg";

import bookshelf = require("../bookshelf");
import {Deployment} from "./deployment";

export interface PGInterval {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export class TaskTemplate extends BaseModel<TaskTemplate> {
  get tableName() { return "task_templates"; }
  get idAttribute() {return "type"; }

  deployment() {
    return this.belongsTo(Deployment);
  }

  // columns
  get description(): string { return this.get("description"); }
  get title(): string { return this.get("title"); }
  get estimatedTime(): PGInterval { return this.get("estimated_time"); }
  get instructions(): Array<any> { return this.get("instructions"); }
  get completedWebhook(): string { return this.get("completed_webhook"); }

  get estimatedTimeMin(): number {
    const int = _.defaults(this.estimatedTime, {hours: 0, minutes: 0, seconds: 0});
    return int.hours * 60 + int.minutes + int.seconds / 60;
  }

  renderInstructions(context) {
    const promises = this.instructions.map((i) => {
        return new Promise((resolve, reject) => {
          dust.renderSource(JSON.stringify(i.message), context, (err, out) => {
            if (err) return reject(err);
            i.message = JSON.parse(out);
              return resolve(i);
          });
        });
    });
    return Promise.all(promises);
  }

}