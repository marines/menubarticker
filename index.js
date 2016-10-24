#!/usr/bin/env /usr/local/bin/node

/*
state: {
    messagesQueue: {
        'github/commit#a8cd3f': {       // unique id
            time: '21-10-2016 16:35',   // original message time
            text: 'Nowy commit w repo',
            expirationTime: 5,          // time the message is to be shown for
            seenFor: 2,                 // time the message already have been shown for
        },
        'ztm/tramwaj#8': {
            time: '21-10-2016 16:35',
            text: 'Nowy commit w repo',
            expirationTime: 4,
            seenFor: 2,
        },
    }
}

*/
var Promise = require('bluebird');
var request = require('request-promise');
var moment = require('moment');
var colors = require('colors');
var fs = require('fs');
var path = require('path');

process.chdir(__dirname);

var state;
try {
    state = require("./state.json");
} catch (e) {
    state = { messagesQueue: {}, locked: false };
}

if (state.locked && moment(state.locked).add(5, 's').isAfter(moment())) {
    process.exit();
}

state.locked = moment().toISOString();
saveState(state);

var sources = [
    /*sourceFactory({
        name: 'github',
        interval: 5,
        expirationTime: 3,
        condition: () => true,
        feed: (state) => new Promise((resolve) => resolve(state)),
    }),*/
    sourceFactory({
        name: 'ztm',
        interval: 20,
        expirationTime: 60,
        condition: () => true || parseInt(moment().format('HH')) > '15' && parseInt(moment().format('HH')) < '19',
        feed: (source, state) => ztm(source, state, '8', '2061'),
    }),
];

function run(state) {
    var promises = sources
        .filter(source => source.condition())
        .map(source => source.feed(source, state));

    Promise.all(promises).then((values) => {
        displayQueue(state);
        state.locked = false;
        saveState(state);
    })
    .finally(() => {
        console.log('Mariusz Kujawski 2016');
    });
}

function displayQueue(state) {
    Object.keys(state.messagesQueue).forEach(id => {
        console.log(`➡️ ${state.messagesQueue[id].text}`);
        console.log(`[${id}]`);
    });
}

function sourceFactory(sourceBlueprint) {
    var source = function() {
        this.name = sourceBlueprint.name;
        this.interval = sourceBlueprint.interval;
        this.expirationTime = sourceBlueprint.expirationTime;
        this.condition = sourceBlueprint.condition.bind(this);
        this.feed = sourceBlueprint.feed.bind(this);
    };

    return new source();
}

function createMessage(text, expirationTime) {
    return {
        time: moment().format('DD-MM-YYYY HH:mm:ss'),
        text,
        expirationTime,
        seenFor: 0,
    };
}

function ztm(source, state, tramwaj, przystanek) {
    function printEta(mins) {
        var id = `${source.name}/tramwaj#${przystanek}&${tramwaj}`;
        var message = `Tramwaj ${tramwaj} odjeżdża za ${mins} minut!`;

        if (state.messagesQueue[id]) {
            state.messagesQueue[id].seenFor++;
            state.messagesQueue[id].text = message;
        } else {
            state.messagesQueue[id] = createMessage(message, source.expirationTime);
        }
    }

    var url = `http://www.ztm.gda.pl/rozklady/pobierz_SIP.php?n[0]=${przystanek}&t=&l=${tramwaj}`;
    return request({ uri: url, resolveWithFullResponse: true }).then(response => {
        var body = response.body;

        var matches = body.match(new RegExp('.*>' + tramwaj + '<.*<td>(.*)<\/td>'));

        if (matches[1].indexOf('za') > -1) {
            var matches2 = matches[1].match(/[0-9]+/);
            printEta(matches2[0]);
        } else if (matches[1] === '&nbsp;') {
            printEta(0);
        } else {
            var now = moment();
            var then = moment(matches[1], 'HH:mm');
            var difference = then.diff(now, 'minutes');
            printEta(difference);
        }
    });
}

function saveState(state) {
    // console.log(JSON.stringify(state, null, 2));
    fs.writeFile('./state.json', JSON.stringify(state), "utf8");
    return state;
}

run(state);
