#!/usr/bin/env /usr/local/bin/node
var Promise = require('bluebird');
var request = require('request-promise');
var moment = require('moment');
var colors = require('colors');
var fs = require('fs');
var path = require('path');
var bitbar = require('bitbar');
var _ = require('lodash');

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
        expirationTime: 30,
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
    });
}

function displayQueue(state) {
    bitbar(_.map(state.messagesQueue, msg => msg.bitbar));
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

function createMessage(text, expirationTime, color) {
    return {
        time: moment().format('DD-MM-YYYY HH:mm:ss'),
        expirationTime,
        seenFor: 0,
        bitbar: {
            text,
            color: color ? color : 'black',
            dropdown: false,
        },
    };
}

function ztm(source, state, tramwaj, przystanek) {
    function printEta(mins) {
        var id = `${source.name}/tramwaj#${przystanek}&${tramwaj}`;
        var message = `Tramwaj ${tramwaj} odjeżdża za ${mins} minut!`;
        var color = mins > 4 ? 'black' : 'red';

        if (state.messagesQueue[id]) {
            state.messagesQueue[id].seenFor++;
            state.messagesQueue[id].bitbar.text = message;
            state.messagesQueue[id].bitbar.color = color;
        } else {
            state.messagesQueue[id] = createMessage(message, source.expirationTime, color);
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
    state.messagesQueue = _.reduce(state.messagesQueue, (messages, current, key) => {
        if (current.seenFor <= current.expirationTime) {
            messages[key] = current;
        }

        return messages;
    }, {});

    // console.log(JSON.stringify(state, null, 2));
    fs.writeFile('./state.json', JSON.stringify(state), "utf8");
    return state;
}

run(state);
