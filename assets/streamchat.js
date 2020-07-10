import Chat from './chat/js/chat';
// import emotes from './emotes.json';

// $.when(
//     new Promise(res => $.getJSON(`${API_URI}/api/chat/nonce`).done(res).fail(() => res(null))),
//     new Promise(res => $.getJSON(`${API_URI}/for/apiAssets/chat/emotes.json`).done(res).fail(() => res(null))),
//     new Promise(res => $.getJSON(`${API_URI}/for/apiAssets/chat/icons.json`).done(res).fail(() => res(null))),
//     // new Promise(res => $.getJSON(`${API_URI}/api/chat/nonce`).done(res).fail(() => res(null))),
//     // new Promise(res => $.getJSON(`${API_URI}/for/apiAssets/chat/emotes.json`).done(res).fail(() => res(null))),
// ).then((nonce, emotes, icons) =>
//     window.__chat__ = new Chat()
//         .withEmotes(nonce, emotes)
//         .withIcons(nonce, icons)
//         .withGui()
//         .connect((((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + "/ws"))
// )
const uri = '../..';
const stage = true; // TRUE = PROD, FALSE = STAGE
const webSocket = `ws${location.protocol === 'https:' ? 's' : ''}://${location.host}/ws`;
// const webSocket = (((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + "/ws");
const nonceURI = stage ? `${uri}/api/chat/nonce` : `${uri}/api/chat/nonceStage`;
const iconsURI = stage ? `${uri}/for/apiAssets/chat/icons.json` : `${uri}/for/apiAssets/chatStage/icons.json`;
const emotesURI = stage ? `${uri}/for/apiAssets/chat/emotes.json` : `${uri}/for/apiAssets/chatStage/emotes.json`;
const userURI = `${uri}/api/chat/me`;
const historyURI = `${uri}/api/chat/history`;
const metaURI = `${uri}/api/meta/get`;
const historyInfo = async v => await new Promise(res => $.getJSON(historyURI).done(res).fail(() => res(null)));
const nonceInfo = async v => await new Promise(res => $.getJSON(nonceURI).done(res).fail(() => res(null)));
const emotesInfo = async v => await new Promise(res => $.getJSON(emotesURI).done(res).fail(() => res(null)));
const iconsInfo = async v => await new Promise(res => $.getJSON(iconsURI).done(res).fail(() => res(null)));
// const metaInfo = new Promise(res => $.getJSON(metaURI).done(res).fail(() => res(null)));
const init = async v => {
const nonce = await nonceInfo();
const emotes = await emotesInfo();
const history = await historyInfo();
const icons = await iconsInfo();

const chat = await new Chat({
    url: webSocket,
    api: {base: `${location.protocol}//${location.host}`},
    cdn: {base: `${location.protocol}//${location.host}`},
    nonce: nonce,
    emotes: emotes,
    icons: icons
});

chat.withGui()
    .then(async() => chat.withEmotes(stage))
    // .then(() => chat.loadEmotesAndFlairs())
    // .then(() => chat.withEmotes(nonceInfo, emotesInfo, stage))
    .then(async() => chat.withIcons(stage))
    .then(async() => chat.withHistory(history))
    .then(async() => chat.connect(webSocket))

    // setInterval(() => fetch(`${chat.config.api.base}/ping`).catch(console.warn), 10*60*1000)
}
init();