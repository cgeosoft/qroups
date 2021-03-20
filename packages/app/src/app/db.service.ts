import { Injectable } from '@angular/core';
import * as faker from 'faker';
import {
  addRxPlugin,
  createRxDatabase
} from 'rxdb/plugins/core';
// TODO import these only in non-production build
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import {
  pullQueryBuilderFromRxSchema,
  pushQueryBuilderFromRxSchema, RxDBReplicationGraphQLPlugin
} from 'rxdb/plugins/replication-graphql';
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

const GRAPHQL_PORT = 10102;
const GRAPHQL_PATH = '/graphql';
const GRAPHQL_SUBSCRIPTION_PORT = 10103;
const GRAPHQL_SUBSCRIPTION_PATH = '/subscriptions';

console.log('hostname: ' + window.location.hostname);
const syncURL = 'http://' + window.location.hostname + ':' + GRAPHQL_PORT + GRAPHQL_PATH;

const heroSchema = {
  version: 0,
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
    updatedAt: {
      type: 'number'
    }
  },
  indexes: ['name', 'color', 'updatedAt'],
  required: ['color']
};

const batchSize = 5;

const hero = {
  schema: heroSchema,
  feedKeys: [
    'id',
    'updatedAt'
  ],
  deletedFlag: 'deleted',
  subscriptionParams: {
    token: 'String!'
  }
}

const pullQueryBuilder = pullQueryBuilderFromRxSchema(
  'hero',
  hero,
  batchSize
);
const pushQueryBuilder = pushQueryBuilderFromRxSchema(
  'hero',
  hero
);

@Injectable({
  providedIn: 'root'
})
export class DbService {

  heros$ = new BehaviorSubject<any[]>([])
  name = "testdb"
  collections: any;

  async setup() {
    console.log('Create database..');
    const db = await createRxDatabase({
      name: this.name,
      adapter: 'idb'
    });

    console.log('Create collection..');
    this.collections = await db.addCollections({
      hero: { schema: heroSchema }
    });


    // set up replication
    console.log('Start replication..');
    const replicationState = this.collections['hero'].syncGraphQL({
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
    replicationState.error$.subscribe((err: any) => {
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
      next: async (data) => {
        console.log('subscription emitted => trigger run()');
        console.dir(data);
        await replicationState.run();
        console.log('run() done');
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
    await replicationState.awaitInitialReplication();

    // subscribe to heroes list and render the list on change
    console.log('Subscribe to query..');
    this.heros$ = this.collections['hero'].find().sort({
      name: 'asc'
    }).$

    // set up click handlers
    // window.deleteHero = async (id) => {
    //   console.log('delete doc ' + id);
    //   const doc = await collection.findOne(id).exec();
    //   if (doc) {
    //     console.log('got doc, remove it');
    //     try {
    //       await doc.remove();
    //     } catch (err) {
    //       console.error('could not remove doc');
    //       console.dir(err);
    //     }
    //   }
    // };
    // insertButton.onclick = async function () {
    //   const name = document.querySelector('input[name="name"]').value;
    //   const color = document.querySelector('input[name="color"]').value;
    //   const obj = {
    //     id: name,
    //     name: name,
    //     color: color
    //   };
    //   console.log('inserting hero:');
    //   console.dir(obj);

    //   await collection.insert(obj);
    //   document.querySelector('input[name="name"]').value = '';
    //   document.querySelector('input[name="color"]').value = '';
    // };
  }

  async add() {
    const name = faker.name.findName()
    const color = faker.commerce.color();
    const obj = {
      id: name,
      name: name,
      color: color
    };
    console.log('inserting hero:');
    console.dir(obj);

    await this.collections['hero'].insert(obj);
  };
}
