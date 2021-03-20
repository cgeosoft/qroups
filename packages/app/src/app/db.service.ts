import { Injectable } from '@angular/core';
import * as cuid from 'cuid';
import * as faker from 'faker';
import { addRxPlugin, createRxDatabase } from 'rxdb/plugins/core';
// TODO import these only in non-production build
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { pullQueryBuilderFromRxSchema, pushQueryBuilderFromRxSchema, RxDBReplicationGraphQLPlugin } from 'rxdb/plugins/replication-graphql';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { BehaviorSubject } from 'rxjs';
import {
  SubscriptionClient
} from 'subscriptions-transport-ws';

addRxPlugin(require('pouchdb-adapter-idb'));
addRxPlugin(RxDBReplicationGraphQLPlugin);

addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBValidatePlugin);

addRxPlugin(RxDBUpdatePlugin);

addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBMigrationPlugin);


const GRAPHQL_PORT = 10102;
const GRAPHQL_PATH = '/graphql';
const GRAPHQL_SUBSCRIPTION_PORT = 10103;
const GRAPHQL_SUBSCRIPTION_PATH = '/subscriptions';

const syncURL = 'http://' + window.location.hostname + ':' + GRAPHQL_PORT + GRAPHQL_PATH;

const schema = {
  version: 2,
  type: 'object',
  properties: {
    id: {
      type: 'string',
      primary: true
    },
    name: {
      type: 'string'
    },
    color: {
      type: 'string'
    },
    createdAt: {
      type: ["number", "null"],
    },
    updatedAt: {
      type: 'number'
    }
  },
  indexes: ['name', 'updatedAt'],
  required: ['name']
};

const batchSize = 50;

const hero = {
  schema: schema,
  feedKeys: [
    'id',
    'updatedAt'
  ],
  deletedFlag: 'deleted',
  // subscriptionParams: {
  //   token: 'String!'
  // }
}
const migrationStrategies = {
  // 1 means, this transforms data from version 0 to version 1
  1: (oldDoc: any) => {
    oldDoc.createdAt = new Date().getTime(); // string to unix
    return oldDoc;
  },
  2: (oldDoc: any) => oldDoc,
}

const pullQueryBuilder = pullQueryBuilderFromRxSchema('hero', hero, batchSize);
const pushQueryBuilder = pushQueryBuilderFromRxSchema('hero', hero);

@Injectable({
  providedIn: 'root'
})
export class DbService {

  heros$ = new BehaviorSubject<any[]>([])
  name = "testdb"
  collections: any;
  replicationState: any;

  async setup() {
    console.log('Create database..');
    const db = await createRxDatabase({
      name: this.name,
      adapter: 'idb'
    });

    console.log('Create collection..');
    this.collections = await db.addCollections({
      hero: {
        schema,
        migrationStrategies
      }
    });

    // set up replication
    console.log('Start replication..');
    this.replicationState = this.collections['hero'].syncGraphQL({
      url: syncURL,
      headers: {
        /* optional, set an auth header */
        // Authorization: 'Bearer ' + JWT_BEARER_TOKEN
      },
      push: {
        batchSize,
        queryBuilder: pushQueryBuilder
      },
      pull: {
        queryBuilder: pullQueryBuilder
      },
      live: true,
      /**
       * Because the websocket is used to inform the client
       * when something has changed,
       * we can set the liveIntervall to a high value
       */
      liveInterval: 1000 * 60 * 10, // 10 minutes
      deletedFlag: 'deleted'
    });
    // show replication-errors in logs
    console.log('Subscribe to errors..');
    this.replicationState.error$.subscribe((err: any) => {
      console.error('replication error:');
      console.dir(err);
    });


    // setup graphql-subscriptions for pull-trigger
    console.log('Create SubscriptionClient..');
    const endpointUrl = 'ws://localhost:' + GRAPHQL_SUBSCRIPTION_PORT + GRAPHQL_SUBSCRIPTION_PATH;
    const wsClient = new SubscriptionClient(endpointUrl,
      {
        reconnect: true,
        timeout: 1000 * 60,
        // onConnect: () => {
        //   console.log('SubscriptionClient.onConnect()');
        // },
        connectionCallback: () => {
          console.log('SubscriptionClient.connectionCallback:');
        },
        reconnectionAttempts: 10000,
        inactivityTimeout: 10 * 1000,
        lazy: true
      });
    console.log('Subscribe to GraphQL Subscriptions..');
    const query = `
        subscription onChangedHero {
            changedHero {
                id
            }
        }
    `;
    const ret = wsClient.request(
      {
        query,
        /**
         * there is no method in javascript to set custom auth headers
         * at websockets. So we send the auth header directly as variable
         * @link https://stackoverflow.com/a/4361358/3443137
         */
        variables: {
          // token: JWT_BEARER_TOKEN
        }
      }
    );
    ret.subscribe({
      next: async (resp: any) => {
        console.log('subscription emitted => changedHero', resp.data.changedHero.id);
        await this.replicationState.run();
      },
      error(error) {
        console.log('run() got error:');
        console.dir(error);
      }
    });

    /**
     * We await the inital replication
     * so that the client never shows outdated data.
     * You should not do this if you want to have an
     * offline-first client, because the inital sync
     * will not run through without a connection to the
     * server.
     */
    console.log('Await initial replication..');
    await this.replicationState.awaitInitialReplication();

    // subscribe to heroes list and render the list on change
    console.log('Subscribe to query..');
    this.heros$ = this.collections['hero'].find().sort({
      name: 'asc'
    }).$
  }

  async forceReplication() {
    await this.replicationState.run();
  }

  async add() {
    const name = faker.name.findName()
    const color = faker.commerce.color();
    const obj = {
      id: cuid(),
      name: name,
      color: color,
      createdAt: Date.now()
    };
    console.log('inserting hero:');
    console.dir(obj);

    await this.collections['hero'].insert(obj);
  };

  async remove(id: string) {
    console.log('delete doc ' + id);
    const doc = await this.collections['hero'].findOne(id).exec();
    if (doc) {
      console.log('got doc, remove it');
      try {
        await doc.remove();
      } catch (err) {
        console.error('could not remove doc');
        console.dir(err);
      }
    }
  }
}
