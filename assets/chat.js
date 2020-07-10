import $ from 'jquery';
import {fetch} from 'whatwg-fetch';
import Chat from './chat/js/chat';

const uri = '../..';
const stage = false;
const webSocket = `ws${location.protocol === 'https:' ? 's' : ''}://${location.host}/ws`;

const nonceURI = !stage ? `${uri}/api/chat/nonce` : `${uri}/api/chat/nonceStage`;
const iconsURI = !stage ? `${uri}/for/apiAssets/chat/icons.json` : `${uri}/for/apiAssets/chatStage/icons.json`;
const emotesURI = !stage ? `${uri}/for/apiAssets/chat/emotes.json` : `${uri}/for/apiAssets/chatStage/emotes.json`;
const historyURI = `${uri}/api/chat/history`;
const metaURI = `${uri}/api/meta/get`;
const metaNonceURI = `${uri}/api/meta/nonce`;

const historyInfo = async v => await new Promise(res => $.getJSON(historyURI).done(res).fail(() => res(null)));
const nonceInfo = async v => await new Promise(res => $.getJSON(nonceURI).done(res).fail(() => res(null)));

const init = async v => {
    const nonce = await nonceInfo();
    const emotesInfo = async v => await new Promise(res => $.getJSON(emotesURI + "?" + nonce['emotes']).done(res).fail(() => res(null)));
    const iconsInfo = async v => await new Promise(res => $.getJSON(iconsURI + "?" + nonce['flair']).done(res).fail(() => res(null)));
    const metaInfo = async v => await new Promise(res => $.getJSON(metaURI).done(res).fail(() => res(null)));
    const metaNonceInfo = async v => await new Promise(res => $.getJSON(metaNonceURI).done(res).fail(() => res(null)));

    // This prevents the waterfall when a user is loading chat by loading as many async assets as possible
    const promiseSync = await Promise.all([emotesInfo(), historyInfo(), iconsInfo(), metaInfo(), metaNonceInfo()]);

    const chat = new Chat({
        url: webSocket,
        api: {base: `${location.protocol}//${location.host}`},
        cdn: {base: `${location.protocol}//${location.host}`},
        nonce: nonce,
        emotes: promiseSync[0],
        icons: promiseSync[2],
        meta: JSON.parse(promiseSync[3]),
        metaNonce: promiseSync[4]
    });

    await chat.withGui()
    .then(async() => await Promise.all([chat.loadUserAndSettings(), chat.withEmotes(!stage), chat.withIcons(!stage), chat.withHistory(promiseSync[1]), chat.loadWhispers(), chat.withMeta()]))
    .then(() => chat.connect(webSocket))    
    }

    init()
    .then(() => setInterval(() => fetch(`${location.protocol}//${location.host}/ping`).catch(console.warn), 10*60*1000))