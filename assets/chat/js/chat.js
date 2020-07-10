/* global window, document */

import {fetch} from 'whatwg-fetch'
import $ from 'jquery'
import {KEYCODES, DATE_FORMATS, isKeyCode, GENERIFY_OPTIONS} from './const';
import debounce from 'throttle-debounce/debounce';
import moment from 'moment';
import EventEmitter from './emitter';
import ChatSource from './source';
import ChatUser from './user';
import {MessageBuilder, MessageTypes} from './messages';
import {ChatMenu, ChatUserMenu, ChatWhisperUsers, ChatEmoteMenu, ChatSettingsMenu} from './menus';
import ChatAutoComplete from './autocomplete';
import ChatInputHistory from './history';
import ChatUserFocus from './focus';
import ChatSpoiler from './spoiler';
import ChatStore from './store';
import Settings from './settings';
import ChatWindow from './window';
import ChatVote from './vote'

const regexslashcmd = /^\/([a-z0-9]+)[\s]?/i
const regextime = /(\d+(?:\.\d*)?)([a-z]+)?/ig;
const regexsafe = /[\-\[\]\/{}()*+?.\\^$|]/g;
const nickmessageregex = /(?:(?:^|\s)@?)([a-zA-Z0-9_]{3,20})(?=$|\s|[.?!,])/g;
const nickregex = /^[a-zA-Z0-9_]{3,20}$/;
const nsfwnsfl = new RegExp(`\\b(?:NSFL|NSFW)\\b`, 'i');
const tagcolors = [
    'green',
    'yellow',
    'orange',
    'red',
    'purple',
    'blue',
    'sky',
    'lime',
    'pink',
    'black'
];
const errorstrings = new Map([
    ['unknown', 'There was an unknown error'],
    ['nopermission', 'You do not have the correct permissions for that command'],
    ['protocolerror', 'Invalid or Incorrectly Formatted Message/Command'],
    ['needlogin', 'You are not currently logged in. If this issue persists after refreshing, try logging out and back in.'],
    ['invalidmsg', 'There was an error sending your message. It may have hit the character limit.'],
    ['throttled', 'You tried sending messages too quickly'],
    ['duplicate', 'Your previous message was identical.'],
    ['muted', 'You are currently muted. Mutes are never permanent.'],
    ['submode', 'The chat is currently in sub-only mode'],
    ['needbanreason', 'Providing a reason for the ban is currently required'],
    ['banned', 'You are currently banned.'],
    ['privmsgbanned', 'You are currently banned and cannot use this feature.'],
    ['requiresocket', 'Chat requires that your browser supports Websockets'],
    ['toomanyconnections', 'Only 5 connections allowed. Make sure you do not have the chat open in multiple tabs or close and re-open your browser.'],
    ['socketerror', 'There was an error connecting to the Server. Chat requires your browser to support Websockets.'],
    ['privmsgaccounttooyoung', 'Your account is too new to use this feature'],
    ['notfound', 'The user was not found'],
    ['notconnected', 'You are not currently connected to chat. If this issue persists after refreshing, try logging out and back in.']
]);
const settingsdefault = new Map([
    ['schemaversion', 2],
    ['showtime', false],
    ['hideflairicons', false],
    ['profilesettings', true],
    ['timestampformat', 'HH:mm'],
    ['maxlines', 250],
    ['notificationwhisper', true],
    ['notificationhighlight', true],
    ['highlight', true], // todo rename this to `highlightself` or something
    ['customhighlight', []],
    ['highlightnicks', []],
    ['taggednicks', []],
    ['showremoved', 0], // 0 = false (removes), 1 = true (censor), 2 = do nothing
    ['showhispersinchat', true],
    ['ignorenicks', []],
    ['focusmentioned', false],
    ['notificationtimeout', true],
    ['ignorementions', false],
    ['autocompletehelper', true],
    ['taggedvisibility', false],
    ['hidensfw', false],
    ['animateforever', false],
    ['formatter-green', true],
    ['formatter-emote', true],
    ['formatter-antilinkgore', true],
    ['boldtags', true],
    ['allowRefresh', true],
]);
const commandsinfo = new Map([
    ['help', {
        desc: 'Helpful information.'        
    }],
    ['emotes', {
        desc: 'A list of the chats emotes in text form.'        
    }],
    ['me', {
        desc: 'A message with intent'        
    }],
    ['message', {
        desc: 'Some someone a private message',
        alias: ['msg', 'whisper', 'w', 'tell', 't', 'notify', 'pm', 'dm']
    }],
    ['ignore', {
        desc: 'No longer see a users messages',
        alias: ['block']
    }],
    ['unignore', {
        desc: 'Remove a user from your ignore list',
        alias: ['unblock']
    }],
    ['highlight', {
        desc: 'Highlights a target users messages'
    }],
    ['unhighlight', {
        desc: 'Unhighlight target user'
    }],
    ['maxlines', {
        desc: 'The maximum number of lines the chat will store. A lower number may improve performance.'
    }],
    ['mute', {
        desc: 'The users messages will be blocked from everyone.',
        admin: true
    }],
    ['unmute', {
        desc: 'Unmute the user.',
        admin: true
    }],
    ['subonly', {
        desc: 'Subscribers only',
        admin: true
    }],
    ['ban', {
        desc: 'User will no longer be able to connect to the chat.',
        admin: true
    }],
    ['unban', {
        desc: 'Unban a user', 
        admin: true
    }],
    ['timestampformat', {
        desc: 'Set the time format of the chat.'
    }],
    ['tag', {
        desc: 'Mark a users messages'
    }],
    ['untag', {
        desc: 'Unmark a users messages'
    }],
    ['exit', {
        desc: 'Exit the conversation'
    }],
    ['vote', {
        desc: 'Start a vote. You must have a question mark at the end of your question.'
    }],
    ['votestop', {
        desc: 'Stop the poll.'
    }], 
]);
const banstruct = {
    id: 0,
    userid: 0,
    username: '',
    targetuserid: '',
    targetusername: '',
    ipaddress: '',
    reason: '',
    starttimestamp: '',
    endtimestamp: ''
};

class Chat {
    constructor(config) {
        this.config = Object.assign({}, {
            url: '',
            api: {base: ''},
            cdn: {base: ''},
            nonce: '',
            emotes: {defaultEmotes: [], subEmotes: [], hiddenEmotes: []},
            icons: {},
            meta: {title: "", description: "", domain: "", keywords: "", accentColor: "#fff"},
            metaNonce: {favicon: '', modal: "", logo: "", embed: ""},
        }, config)
        this.ui = null;
        this.css = null;
        this.output = null;
        this.input = null;
        this.loginscrn = null;
        this.loadingscrn = null;
        this.showmotd = true;
        this.authenticated = false;
        this.backlogloading = false;
        this.unresolved = [];
        this.emoticons = new Set([...this.config.emotes['defaultEmotes']]);
        this.subemotes = new Set([...this.config.emotes['subEmotes']]);
        this.hiddenemotes = new Set([...this.config.emotes['hiddenEmotes']]);
        this.emoteswithsuffixes = new Set();
        this.user = new ChatUser();
        this.users = new Map();
        this.whispers = new Map();
        this.windows = new Map();
        this.settings = new Map([...settingsdefault]);
        this.autocomplete = new ChatAutoComplete();
        this.menus = new Map();
        this.taggednicks = new Map();
        this.ignoring = new Set();
        this.mainwindow = null;
        this.nukes = [];
        this.flairs = [];
        this.emotePrefixes = new Set();
        this.regexhighlightcustom = null;
        this.regexhighlightnicks = null;
        this.regexhighlightself = null;
        // An interface to tell the chat to do things via chat commands, or via emit
        // e.g. control.emit('CONNECT', 'ws://localhost:9001') is essentially chat.cmdCONNECT('ws://localhost:9001')
        this.control = new EventEmitter(this);

        // The websocket connection, emits events from the chat server
        this.source = new ChatSource();

        this.source.on('REFRESH', () => window.location.reload(false));
        this.source.on('PING', data => this.source.send('PONG', data));
        this.source.on('CONNECTING', data => this.onCONNECTING(data));
        this.source.on('OPEN', data => this.onOPEN(data));
        this.source.on('DISPATCH', data => this.onDISPATCH(data));
        this.source.on('CLOSE', data => this.onCLOSE(data));
        this.source.on('NAMES', data => this.onNAMES(data));
        this.source.on('QUIT', data => this.onQUIT(data));
        this.source.on('MSG', data => this.onMSG(data));
        this.source.on('MUTE', data => this.onMUTE(data));
        this.source.on('UNMUTE', data => this.onUNMUTE(data));
        this.source.on('BAN', data => this.onBAN(data));
        this.source.on('EMBED', data => this.onEMBED(data));
        this.source.on('UNBAN', data => this.onUNBAN(data));
        this.source.on('ERR', data => this.onERR(data));
        this.source.on('SOCKETERROR', data => this.onSOCKETERROR(data));
        this.source.on('SUBONLY', data => this.onSUBONLY(data));
        this.source.on('BROADCAST', data => this.onBROADCAST(data));
        this.source.on('PRIVMSGSENT', data => this.onPRIVMSGSENT(data));
        this.source.on('PRIVMSG', data => this.onPRIVMSG(data));

        this.control.on('SEND', data => this.cmdSEND(data));
        this.control.on('EMOTES', data => this.cmdEMOTES(data));
        this.control.on('HELP', data => this.cmdHELP(data));
        this.control.on('IGNORE', data => this.cmdIGNORE(data));
        this.control.on('UNIGNORE', data => this.cmdUNIGNORE(data));
        this.control.on('MUTE', data => this.cmdMUTE(data));
        this.control.on('BAN', data => this.cmdBAN(data, 'BAN'));
        this.control.on('IPBAN', data => this.cmdBAN(data, 'IPBAN'));
        this.control.on('UNMUTE', data => this.cmdUNBAN(data, 'UNMUTE'));
        this.control.on('UNBAN', data => this.cmdUNBAN(data, 'UNBAN'));
        this.control.on('SUBONLY', data => this.cmdSUBONLY(data, 'SUBONLY'));
        this.control.on('MAXLINES', data => this.cmdMAXLINES(data, 'MAXLINES'));
        this.control.on('UNHIGHLIGHT', data => this.cmdHIGHLIGHT(data, 'UNHIGHLIGHT'));
        this.control.on('HIGHLIGHT', data => this.cmdHIGHLIGHT(data, 'HIGHLIGHT'));
        this.control.on('TIMESTAMPFORMAT', data => this.cmdTIMESTAMPFORMAT(data));
        this.control.on('BROADCAST', data => this.cmdBROADCAST(data));
        this.control.on('CONNECT', data => this.cmdCONNECT(data));
        this.control.on('TAG', data => this.cmdTAG(data));
        this.control.on('UNTAG', data => this.cmdUNTAG(data));
        this.control.on('BANINFO', data => this.cmdBANINFO(data));
        this.control.on('EXIT', data => this.cmdEXIT(data));
        this.control.on('MESSAGE', data => this.cmdWHISPER(data));
        this.control.on('MSG', data => this.cmdWHISPER(data));
        this.control.on('WHISPER', data => this.cmdWHISPER(data));
        this.control.on('W', data => this.cmdWHISPER(data));
        this.control.on('TELL', data => this.cmdWHISPER(data));
        this.control.on('T', data => this.cmdWHISPER(data));
        this.control.on('DM', data => this.cmdWHISPER(data));
        this.control.on('PM', data => this.cmdWHISPER(data));
        this.control.on('NOTIFY', data => this.cmdWHISPER(data));
        this.control.on('VOTE', data => this.cmdVOTE(data));
        this.control.on('V', data => this.cmdVOTE(data));
        this.control.on('VOTESTOP', data => this.cmdVOTESTOP(data));
        this.control.on('VS', data => this.cmdVOTESTOP(data));
        
        return this;
    }

    withGui() {
        this.ui = $('#chat');
        this.css = $('#chat-styles')[0]['sheet'];
        this.ishidden = (document['visibilityState'] || 'visible') !== 'visible';
        this.output = this.ui.find('#chat-output-frame');
        this.input = this.ui.find('#chat-input-control');
        this.loginscrn = this.ui.find('#chat-login-screen');
        this.loadingscrn = this.ui.find('#chat-loading');
        this.windowselect = this.ui.find('#chat-windows-select');
        this.inputhistory = new ChatInputHistory(this);
        this.userfocus = new ChatUserFocus(this, this.css);
        this.spoiler = new ChatSpoiler(this);
        this.mainwindow = new ChatWindow('main').into(this);
               
        this.ui.find('#chat-vote-frame:first').each((i, e) => {
            this.chatvote = new ChatVote(this, $(e))
        });        

        this.windowToFront('main');

        this.menus.set('settings',
            new ChatSettingsMenu(this.ui.find('#chat-settings'), this.ui.find('#chat-settings-btn'), this));
        this.menus.set('emotes',
            new ChatEmoteMenu(this.ui.find('#chat-emote-list'), this.ui.find('#chat-emoticon-btn'), this));
        this.menus.set('users',
            new ChatUserMenu(this.ui.find('#chat-user-list'), this.ui.find('#chat-users-btn'), this));
        this.menus.set('whisper-users',
            new ChatWhisperUsers(this.ui.find('#chat-whisper-users'), this.ui.find('#chat-whisper-btn'), this));

        commandsinfo.forEach((a, k) => {
            this.autocomplete.add(`/${k}`);
            (a['alias'] || []).forEach(k => this.autocomplete.add(`/${k}`));
        });
        this.emoticons.forEach(e => this.autocomplete.add(e, true));
        this.subemotes.forEach(e => this.autocomplete.add(e, true));
        this.hiddenemotes.forEach(e => this.autocomplete.add(e, true));
        const suffixes = Object.keys(GENERIFY_OPTIONS);
        suffixes.forEach(e => this.autocomplete.add(`:${e}`, true));
        this.autocomplete.bind(this);
        this.applySettings(false);

        // Chat input
        this.input.on('keypress', e => {
            if (isKeyCode(e, KEYCODES.ENTER) && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                if (!this.authenticated) {
                    this.loginscrn.show();
                } else {
                    this.control.emit('SEND', this.input.val().toString().trim());
                    this.input.val('').trigger('input');
                }
                this.input.focus();
            }
        });

        /**
         * Syncing the text content of the scaler with the input, so that
         * the scaler grows the containing element to the exact size to
         * contain the text entered.
         */
        const inputScaler = this.ui.find('#chat-input-scaler');
        let lastHeightScaler = 0;

        this.input.on('input keydown', () => {
            // Get pinned state before syncing the scaler
            const wasScrollPinned = this.mainwindow.scrollplugin.isPinned();
            inputScaler.text(this.input.val());

            if (lastHeightScaler !== inputScaler.height()) {
                lastHeightScaler = inputScaler.height();
                this.mainwindow.scrollplugin.reset();

                if (wasScrollPinned) {
                    this.mainwindow.updateAndPin();
                }
            }
        });

        // Chat focus / menu close when clicking on some areas
        let downinoutput = false;
        this.output.on('mousedown', () => { downinoutput = true; });
        this.output.on('mouseup', () => {
            if (downinoutput) {
                downinoutput = false;
                ChatMenu.closeMenus(this);
                this.focusIfNothingSelected();
            }
        });
        this.ui.on('click', '#chat-tools-wrap', () => {
            ChatMenu.closeMenus(this);
            this.focusIfNothingSelected();
        });

        // ESC
        document.addEventListener('keydown', e => {
            if (isKeyCode(e, KEYCODES.ESC)) ChatMenu.closeMenus(this); // ESC key
        });

        // Visibility
        document.addEventListener('visibilitychange', debounce(100, () => {
            this.ishidden = (document['visibilityState'] || 'visible') !== 'visible';
            if (!this.ishidden) this.focusIfNothingSelected();
            else ChatMenu.closeMenus(this);
        }), true);

        // Resize
        let resizing = false;
        const onresizecomplete = debounce(100, () => {
            resizing = false;
            this.getActiveWindow().unlock();
            this.focusIfNothingSelected();
        });
        const onresize = () => {
            if (!resizing) {
                resizing = true;
                ChatMenu.closeMenus(this);
                this.getActiveWindow().lock();
            }
            onresizecomplete();
        };
        window.addEventListener('resize', onresize, false);

        // Chat user whisper tabs
        this.windowselect.on('click', '.fa-close', e => {
            ChatMenu.closeMenus(this);
            this.removeWindow($(e.currentTarget).parent().data('name').toLowerCase());
            this.input.focus();
            return false;
        });
        this.windowselect.on('click', '.tab', e => {
            ChatMenu.closeMenus(this);
            this.windowToFront($(e.currentTarget).data('name').toLowerCase());
            this.input.focus();
            return false;
        });

        // Censored
        this.output.on('click', '.censored', e => {
            const nick = $(e.currentTarget).closest('.msg-user').data('username');
            this.getActiveWindow()
                .getlines(`.censored[data-username="${nick}"]`)
                .removeClass('censored');
            return false;
        });

        // Login
        this.loginscrn.on('click', '#chat-btn-login', () => {
            this.loginscrn.hide();
            if (LOGIN_URI) {
                window.top.location.href = LOGIN_URI;
                return;
            }
            try {
                window.top.showLoginModal();
            } catch (_) {
                const {origin, pathname} = location;
                if (window.self === window.top) {
                    let follow = '';
                    try {
                        follow = encodeURIComponent(pathname);
                    } catch (_) {}
                    location.href = `${origin}/login?follow=${follow}`;
                } else {
                    location.href = `${origin}/login`;
                }
            }
            return false;
        });

        this.loginscrn.on('click', '#chat-btn-cancel', () => this.loginscrn.hide());
        this.output.on('click mousedown', '.msg-whisper a.user', e => {
            const msg = $(e.target).closest('.msg-chat');
            this.openConversation(msg.data('username').toString().toLowerCase());
            return false;
        });

        // Keep the website session alive.
        // setInterval(() => $.ajax({url: '/ping'}), 10 * 60 * 1000);
        setInterval(() => fetch(`${location.protocol}//${location.host}/ping`).catch(console.warn), 1*60*1000);

        window.addEventListener('beforeunload', (event) => ChatStore.write('chat.unsentMessage', this.input.val()));

        this.loadingscrn.fadeOut(250, () => this.loadingscrn.remove());
        this.mainwindow.updateAndPin();
        this.input.focus();
        this.input.focus().attr('placeholder', this.authenticated ? `Logged in as ${this.user.username}` : 'Sign in to chat!');
        this.input.val(ChatStore.read('chat.unsentMessage') ? ChatStore.read('chat.unsentMessage') : null);
        return Promise.resolve(this)
    }

    async loadUserAndSettings(){
        return fetch(`${this.config.api.base}/api/chat/me`, {credentials: 'include'})
            .then(res => res.json())
            .then(data => {
                this.setUser(data)
                this.setSettings(new Map(data.settings))
            })
            .catch(() => {
                this.setUser(null)
                this.setSettings()
            })
    }

    async loadWhispers(){
            return fetch(`${this.config.api.base}/api/messages/unread`, {credentials: 'include'})
                .then(res => res.json())
                .then(d => {
                    d.forEach(e => this.whispers.set(e['username'].toLowerCase(), {
                        id: e['messageid'],
                        nick: e['username'],
                        unread: e['unread'],
                        open: false
                    }))
                })
                .then(() => this.menus.get('whisper-users').redraw())
                .catch(() => {})
    }

    saveSettings(){
        if(this.authenticated){
            if(this.settings.get('profilesettings')) {
                fetch(`${this.config.api.base}/api/chat/me/settings`, {
                    body: JSON.stringify([...this.settings]),
                    credentials: 'include',
                    method: 'POST',
                }).catch(console.warn)
            } else {
                ChatStore.write('chat.settings', this.settings);
            }
        } else {
            ChatStore.write('chat.settings', this.settings);
        }
    }

    setUser(user){
        if (!user || user.username === '') {
            this.user = this.addUser({nick: 'User' + Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000})
            this.authenticated = false
        } else {
            this.user = this.addUser(user)
            this.authenticated = true
        }
        // TODO move this
        if (this.authenticated) {
            this.input.focus().attr('placeholder', `Join chat, ${this.user.username}!`)
        }
        return this
    }

    setSettings(settings){
        // If authed and #settings.profilesettings=true use #settings
        // Else use whats in LocalStorage#chat.settings
        let stored = settings !== null && this.authenticated && settings.get('profilesettings') ? settings : new Map(ChatStore.read('chat.settings') || [])

        // Loop through settings and apply any settings found in the #stored data
        if(stored.size > 0) {
            [...this.settings.keys()]
                .filter(k => stored.get(k) !== undefined && stored.get(k) !== null)
                .forEach(k => this.settings.set(k, stored.get(k)))
        }
        // Upgrade if schema is out of date
        const oldversion = stored.has('schemaversion') ? parseInt(stored.get('schemaversion')): -1;
        const newversion = settingsdefault.get('schemaversion')
        if(oldversion !== -1 && newversion > oldversion) {
            Settings.upgrade(this, oldversion, newversion)
            this.settings.set('schemaversion', newversion)
            this.saveSettings()
        }

        this.taggednicks = new Map(this.settings.get('taggednicks'))
        this.taggednotes = new Map(this.settings.get('taggednotes'))
        this.ignoring = new Set(this.settings.get('ignorenicks'))
        return this.applySettings(false)
    }

 

    async withEmotes(stage) {
        const emotes = this.config.emotes;
        const nonce = this.config.nonce;

        Chat.loadCss(stage ? `../../for/apiAssets/chat/emotes.css?${nonce['emotes']}` : `../../for/apiAssets/chatStage/emotes.css?${nonce['emotes']}`);
        this.emoticons = new Set(emotes['defaultEmotes']);
        for (var e of this.emoticons) {
                this.emoteswithsuffixes.add(`^(${e})((?::(?:${Object.keys(GENERIFY_OPTIONS).join('|')}))*)$`);
        }
        this.hiddenemotes = new Set(emotes['hiddenEmotes']);
        for (var e of this.emoticons) {
                this.emoteswithsuffixes.add(`^(${e})((?::(?:${Object.keys(GENERIFY_OPTIONS).join('|')}))*)$`);
        }
        this.subemotes = new Set(emotes['subEmotes']);
        for (var e of this.subemotes) {
                this.emoteswithsuffixes.add(`^(${e})((?::(?:${Object.keys(GENERIFY_OPTIONS).join('|')}))*)$`);
        }
        this.emotePrefixes = new Set([...emotes['defaultEmotes'], ...emotes['hiddenEmotes'], ...emotes['subEmotes']]);
        return this;
    }

    async withMeta () {
        const nonceFavicon = this.config.metaNonce['favicon'];
        const colorTheme = document.createElement('meta');
        colorTheme.name = 'msapplication-TileColor';
        colorTheme.content = this.config.meta['accentColor'];
        document.getElementsByTagName('head')[0].appendChild(colorTheme);

        const colorTile = document.createElement('meta');
        colorTile.setAttribute('property', 'og:theme-color');
        colorTile.content = this.config.meta['accentColor'];      
        document.getElementsByTagName('head')[0].appendChild(colorTile);
        
        const siteName = document.createElement('meta');
        siteName.setAttribute('property', 'og:site_name-color');
        siteName.content = this.config.meta['domain'];
        document.getElementsByTagName('head')[0].appendChild(siteName);

        const siteTitle = document.createElement('meta');
        siteTitle.setAttribute('property', 'og:title');
        siteTitle.content = this.config.meta['title'] + " - Chat";
        document.getElementsByTagName('head')[0].appendChild(siteTitle);
        
        const siteDescription = document.createElement('meta');
        siteDescription.setAttribute('property', 'og:description');
        siteDescription.content = this.config.meta['description'];
        document.getElementsByTagName('head')[0].appendChild(siteDescription);
        // const faviconPack = `<link rel="icon" href="../../for/apiAssets/images/site/favicon/favicon-32.png?${nonceFavicon}" sizes="32x32">`;      
        const sizesIcon = [
            '32x32',
            '57x57',
            '76x76',
            '96x96',
            '128x128',
            '192x192',
            '228x228'
        ];
        const sizesShortcutIcon = ['196x196'];
        const sizesMSTile = ['144'];
        const sizesAppleIcon = [
            '120x120',
            '152x152',
            '180x180',
            '96x96',
            '128x128',
            '192x192',
            '228x228'
        ];

        sizesIcon.map(size => {
            const link = document.createElement('link');
            link.href = `../../for/apiAssets/images/site/favicon/favicon-${size.split("x")[0]}.png?${nonceFavicon}`;
            link.rel = 'icon';
            link.sizes = size;
            document.getElementsByTagName('head')[0].appendChild(link);
        });

        sizesShortcutIcon.map(size => {
            const link = document.createElement('link');
            link.href = `../../for/apiAssets/images/site/favicon/favicon-${size.split("x")[0]}.png?${nonceFavicon}`;
            link.rel = 'icon';
            link.sizes = size;
            document.getElementsByTagName('head')[0].appendChild(link);
        });

        sizesMSTile.map(size => {
            const meta = document.createElement('meta');
            meta.href = `../../for/apiAssets/images/site/favicon/favicon-${size}.png?${nonceFavicon}`;
            meta.name = 'msapplication-TileImage';
            document.getElementsByTagName('head')[0].appendChild(meta);
        });

        sizesAppleIcon.map(size => {
            const link = document.createElement('link');
            link.href = `../../for/apiAssets/images/site/favicon/favicon-${size.split("x")[0]}.png?${nonceFavicon}`;
            link.rel = 'apple-touch-icon';
            link.sizes = size;
            document.getElementsByTagName('head')[0].appendChild(link);
        });

        setTimeout(() => this.mainwindow.updateAndPin(), 100);
        
        return this;
    }

    async withIcons(stage) {
        const icons = this.config.icons;
        const nonce = this.config.nonce;

        Chat.loadCss(stage ? `../../for/apiAssets/chat/icons.css?${nonce['flair']}` : `../../for/apiAssets/chatStage/icons.css?${nonce['flair']}`);
        this.flairs = icons;
        const map = new Map();
        Object.keys(this.flairs).map((v) => {
            map[icons[v].roleName] = icons[v].roleLabel;
        });
        this.flairTitles = map;
        return this;
    }

    async withHistory(history) {
        if (history && history.length > 0) {
            this.backlogloading = true;
            history.forEach(line => this.source.parseAndDispatch({data: line}));
            // MessageBuilder.element('<hr/>').into(this);
            this.backlogloading = false;
            this.mainwindow.updateAndPin();
        }
        return this;
    }

    async withWhispers() {
        if (this.authenticated) {
            $.ajax({url: `../../api/messages/unread`})
                .done(d => d.forEach(e => this.whispers.set(e['username'].toLowerCase(), {
                    id: e['messageid'],
                    nick: e['username'],
                    unread: e['unread'],
                    open: false
                })))
                .always(() => this.menus.get('whisper-users').redraw());
        } 
        return this;
    }

    connect() {
        this.source.connect(this.config.url)
    }

    saveSettings() {
        if (this.authenticated) {
            if (this.settings.get('profilesettings')) {
                $.ajax({url: `../../api/chat/me/settings`, method: 'post', data: JSON.stringify([...this.settings])});
            } else {
                ChatStore.write('chat.settings', this.settings);
            }
        } else {
            ChatStore.write('chat.settings', this.settings);
        }
    }

    // De-bounced saveSettings
    commitSettings() {
        if (!this.debouncedsave) {
            this.debouncedsave = debounce(1000, () => this.saveSettings());
        }
        this.debouncedsave();
    }

    // Save settings if save=true then apply current settings to chat
    applySettings(save = true) {
        if (save) this.saveSettings();

        // Formats
        DATE_FORMATS.TIME = this.settings.get('timestampformat');

        // Ignore Regex
        const ignores = Array.from(this.ignoring.values()).map(Chat.makeSafeForRegex);
        this.ignoreregex = ignores.length > 0 ? new RegExp(`\\b(?:${ignores.join('|')})\\b`, 'i') : null;

        // Highlight Regex
        const cust = [...(this.settings.get('customhighlight') || [])].filter(a => a !== '');
        const nicks = [...(this.settings.get('highlightnicks') || [])].filter(a => a !== '');
        this.regexhighlightself = this.user.nick ? new RegExp(`\\b(?:${this.user.nick})\\b`, 'i') : null;
        this.regexhighlightcustom = cust.length > 0 ? new RegExp(`\\b(?:${cust.join('|')})\\b`, 'i') : null;
        this.regexhighlightnicks = nicks.length > 0 ? new RegExp(`\\b(?:${nicks.join('|')})\\b`, 'i') : null;

        // Settings Css
        Array.from(this.settings.keys())
            .filter(key => typeof this.settings.get(key) === 'boolean')
            .forEach(key => this.ui.toggleClass(`pref-${key}`, this.settings.get(key)));

        // Update maxlines
        [...this.windows].forEach(w => { w.maxlines = this.settings.get('maxlines'); });

        // Formatter enable/disable
        const messages = require('./messages.js');
        messages.setFormattersFromSettings(this.settings);
    }

    addUser(data) {
        if (!data) { return null; }
        const normalized = data.nick.toLowerCase();
        let user = this.users.get(normalized);
        if (!user) {
            user = new ChatUser(data);
            this.users.set(normalized, user);
        } else if (data.hasOwnProperty('features') && !Chat.isArraysEqual(data.features, user.features)) {
            user.features = data.features;
        }
        return user;
    }

    addMessage(message, win = null) {
        // Dont add the gui if user is ignored
        if (message.type === MessageTypes.USER && this.ignored(message.user.nick, message.message)) {
            const isOwn = message.user.username.toLowerCase() === this.user.username.toLowerCase();
            if (!isOwn) return;
        }

        if (win === null) { win = this.mainwindow; }
        if (!this.backlogloading) win.lock();

        // Break the current combo if this message is not an emote
        // We dont need to check what type the current message is, we just know that its a new message, so the combo is invalid.
        if (win.lastmessage && win.lastmessage.type === MessageTypes.EMOTE && win.lastmessage.emotecount > 1) {
            win.lastmessage.completeCombo();
        }

        // Populate the tag, mentioned users and highlight for this $message.
        if (message.type === MessageTypes.USER) {
            // check if message is `/me `
            message.slashme = message.message.substring(0, 4).toLowerCase() === '/me ';
            // check if this is the current users message
            message.isown = message.user.username.toLowerCase() === this.user.username.toLowerCase();
            // check if the last message was from the same user
            message.continued = win.lastmessage && !win.lastmessage.target && win.lastmessage.user && win.lastmessage.user.username.toLowerCase() === message.user.username.toLowerCase();
            // get mentions from message
            message.mentioned = Chat.extractNicks(message.message).filter(a => this.users.has(a.toLowerCase()));
            // set tagged state
            message.tag = this.taggednicks.get(message.user.nick.toLowerCase());
            // set highlighted state if this is not the current users message or a bot, as well as other highlight criteria
            message.highlighted = !message.isown && (
                // Check current user nick against msg.message (if highlight setting is on)
                (this.regexhighlightself && this.settings.get('highlight') && this.regexhighlightself.test(message.message)) ||
                // Check /highlight nicks against msg.nick
                (this.regexhighlightnicks && this.regexhighlightnicks.test(message.user.username)) ||
                // Check custom highlight against msg.nick and msg.message
                (this.regexhighlightcustom && this.regexhighlightcustom.test(message.user.username + ' ' + message.message))
            );
        }

        /* else if(win.lastmessage && win.lastmessage.type === message.type && [MessageTypes.ERROR,MessageTypes.INFO,MessageTypes.COMMAND,MessageTypes.STATUS].indexOf(message.type)){
            message.continued = true
        } */

        // The point where we actually add the message dom
        win.addMessage(this, message);

        // Show desktop notification
        if (!this.backlogloading && message.highlighted && this.settings.get('notificationhighlight') && this.ishidden) {
            Chat.showNotification(
                `${message.user.username} said ...`,
                message.message,
                message.timestamp.valueOf(),
                this.settings.get('notificationtimeout')
            );
        }

        if (!this.backlogloading) win.unlock();
        return message;
    }

    resolveMessage(nick, str) {
        for (const message of this.unresolved) {
            if (this.user.username.toLowerCase() === nick.toLowerCase() && message.message === str) {
                this.unresolved.splice(this.unresolved.indexOf(message), 1);
                return true;
            }
        }
        return false;
    }

    removeMessageByNick(nick) {
        this.mainwindow.lock();
        this.mainwindow.removelines(`.msg-chat[data-username="${nick.toLowerCase()}"]`);
        this.mainwindow.unlock();
    }

    windowToFront(name) {
        const win = this.windows.get(name);
        if (win !== null && win !== this.getActiveWindow()) {
            this.windows.forEach(w => {
                if (w.visible) {
                    if (!w.locked()) w.lock();
                    w.hide();
                }
            });
            win.show();
            if (win.locked()) win.unlock();
            this.redrawWindowIndicators();
        }
        return win;
    }

    getActiveWindow() {
        return [...this.windows.values()].filter(win => win.visible)[0];
    }

    getWindow(name) {
        return this.windows.get(name);
    }

    addWindow(name, win) {
        this.windows.set(name, win);
        this.redrawWindowIndicators();
    }

    removeWindow(name) {
        const win = this.windows.get(name);
        if (win) {
            const visible = win.visible;
            this.windows.delete(name);
            win.destroy();
            if (visible) {
                const keys = [...this.windows.keys()];
                this.windowToFront(this.windows.get(keys[keys.length - 1]).name);
            } else {
                this.redrawWindowIndicators();
            }
        }
    }

    redrawWindowIndicators() {
        if (this.windows.size > 1) {
            this.windowselect.empty();
            this.windows.forEach(w => {
                if (w.name === 'main') {
                    this.windowselect.append(`<span title="Main Chat" data-name="main" class="tab win-main tag-${w.tag} ${w.visible ? 'active' : ''}">Main Chat</span>`);
                } else {
                    const conv = this.whispers.get(w.name);
                    this.windowselect.append(`<span title="${w.label}" data-name="${w.name}" class="tab win-${w.name} tag-${w.tag} ${w.visible ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}">${w.label} ${conv.unread > 0 ? '(' + conv.unread + ')' : ''} <i class="fa fa-close" title="Close" /></span>`);
                }
            });
        }
        // null check on main window, since main window calls this during initialization
        if (this.mainwindow !== null) { this.mainwindow.lock(); }

        this.windowselect.toggle(this.windows.size > 1);

        if (this.mainwindow !== null) { this.mainwindow.unlock(); }
    }

    focusIfNothingSelected() {
        if (this['debounceFocus'] === undefined) {
            this['debounceFocus'] = debounce(10, false, c => c.input.focus())
        }
        if(window.getSelection().isCollapsed && !this.input.is(':focus')) {
            this['debounceFocus'](this);
        }
    }

    censor(nick) {
        this.mainwindow.lock();
        const c = this.mainwindow.getlines(`.msg-chat[data-username="${nick.toLowerCase()}"]`);
        switch (parseInt(this.settings.get('showremoved') || 1)) {
        case 0: // remove
            c.remove();
            break;
        case 1: // censor
            c.addClass('censored');
            break;
        case 2: // do nothing
            break;
        }
        this.mainwindow.unlock();
    }

    ignored(nick, text = null) {
        return this.ignoring.has(nick.toLowerCase()) ||
            (text !== null && this.settings.get('ignorementions') && this.ignoreregex && this.ignoreregex.test(text)) ||
            (text !== null && this.settings.get('hidensfw') && nsfwnsfl.test(text));
    }

    ignore(nick, ignore = true) {
        nick = nick.toLowerCase();
        const exists = this.ignoring.has(nick);
        if (ignore && !exists) {
            this.ignoring.add(nick);
        } else if (!ignore && exists) {
            this.ignoring.delete(nick);
        }
        this.settings.set('ignorenicks', [...this.ignoring]);
        this.applySettings();
    }

    /**
     * EVENTS
     */

    onDISPATCH({data}) {
        if (typeof data === 'object') {
            let users = [];
            if (data.hasOwnProperty('nick')) { users.push(this.addUser(data)); }
            if (data.hasOwnProperty('users')) { users = users.concat(Array.from(data.users).map(d => this.addUser(d))); }
            users.forEach(u => this.autocomplete.add(u.nick, false));
        }
    }

    onCLOSE({retryMilli}) {
        // https://www.iana.org/assignments/websocket/websocket.xml#close-code-number
        // const code = e.event.code || 1006
        if (retryMilli > 0) {
            if(!this.ui.hasClass(`loading-cover`)) this.ui.addClass(`loading-cover`);
            MessageBuilder.error(`There was an error connecting to chat. Automatically attempting to reconnect in ${Math.round(retryMilli / 1000)} seconds. If this persists but the rest of the site is stable, you may need to manually refresh.`).into(this);
        } else {
            MessageBuilder.error(`You have disconnected from chat`).into(this);
        }
    }

    onCONNECTING(url) {
        if(this.ui.hasClass(`pre-load`)) this.ui.removeClass(`pre-load`);
        // MessageBuilder.status(`Trying to connect to ${Chat.extractHostname(url)}`).into(this);
    }

    onOPEN() {
        if(this.ui.hasClass(`pre-load`)) this.ui.removeClass(`pre-load`);
        if(this.ui.hasClass(`loading-cover`)) this.ui.removeClass(`loading-cover`);
        // MessageBuilder.status(`Connected Successfully!`).into(this);
    }

    onNAMES(data) {
        //MessageBuilder.info(`Currently serving ${data['connectioncount'] || 0} connections and ${data['users'].length} users.`).into(this);
        console.log(`${data['connectioncount'] || 0} connections and ${data['users'].length} users.`);
        if (this.showmotd) {
            this.showmotd = false;
        }
    }

    onQUIT(data) {
        const normalized = data.nick.toLowerCase();
        if (this.users.has(normalized)) {
            this.users.delete(normalized);
            this.autocomplete.remove(data.nick, true);
        }
    }

    onMSG(data) {
        const textonly = Chat.removeSlashCmdFromText(data.data)
        const usr = this.users.get(data.nick.toLowerCase())
        // VOTE START
        if (this.chatvote && !this.backlogloading) {
            if (this.chatvote.isVoteStarted()) {
                if (this.chatvote.isMsgVoteStopFmt(data.data)) {
                    if (this.chatvote.vote.user === usr.username) {
                        this.chatvote.endVote()
                    }
                    return;
                } else if (this.chatvote.isMsgVoteCastFmt(textonly)) {
                    // NOTE method returns false, if the GUI is hidden
                    if (this.chatvote.castVote(textonly, usr.username)) {
                        if (usr.username === this.user.username) {
                            this.chatvote.markVote(textonly, usr.username)
                        }
                    }
                    return;
                }
            } else if (this.chatvote.isMsgVoteStartFmt(data.data) && this.chatvote.canUserStartVote(usr)) {
                if (!this.chatvote.startVote(textonly, usr.username)) {
                    if (this.user.username === usr.username) {
                        MessageBuilder.error('Your vote failed to start.')
                    }
                } else {
                    MessageBuilder.info(`A vote has been started. Type ${this.chatvote.vote.totals.map((a, i) => i+1).join(' or ')} in chat`).into(this)
                }
                return;
            }
        }
        // VOTE END
        
        const win = this.mainwindow;
        const isemote = this.emoticons.has(textonly) || this.hiddenemotes.has(textonly) || this.subemotes.has(textonly) ||  this.emoteswithsuffixes.has(textonly);
            if (isemote && win.lastmessage !== null && Chat.extractTextOnly(win.lastmessage.message) === textonly) {
            if (win.lastmessage.type === MessageTypes.EMOTE) {
                this.mainwindow.lock();
                win.lastmessage.incEmoteCount();
                this.mainwindow.unlock();
            } else {
                win.lastmessage.ui.remove();
                MessageBuilder.emote(textonly, data.timestamp, 2).into(this);
            }
        } else if (!this.resolveMessage(data.nick, data.data)) {
            this.autocomplete.promoteOneLastSeen(data.nick);
            const user = this.users.get(data.nick.toLowerCase());
            MessageBuilder.message(data.data, usr, data.timestamp).into(this);
        }
    }

    onMUTE(data) {
        // data.data is the nick which has been banned, no info about duration
        if (this.user.username.toLowerCase() === data.data.toLowerCase()) {
            MessageBuilder.command(`You have been purged/muted. Mutes are never permanent.`, data.timestamp).into(this);
        } else {
            MessageBuilder.command(`${data.data} has been purged/muted. Mutes are never permanent.`, data.timestamp).into(this);
        }
        this.censor(data.data);
    }

    onUNMUTE(data) {
        if (this.user.username.toLowerCase() === data.data.toLowerCase()) {
            MessageBuilder.command(`You have been unmuted by ${data.nick}.`, data.timestamp).into(this);
        } else {
            MessageBuilder.command(`${data.data} has been unmuted`, data.timestamp).into(this);
            //MessageBuilder.command(`${data.data} unmuted by ${data.nick}.`, data.timestamp).into(this);
        }
    }

    onBAN(data) {
        // data.data is the nick which has been banned, no info about duration
        if (this.user.username.toLowerCase() === data.data.toLowerCase()) {
            MessageBuilder.command(`You are currently banned.`, data.timestamp).into(this);
            this.cmdBANINFO();
        } else {
            MessageBuilder.command(`${data.data} has been banned`, data.timestamp).into(this);
            //MessageBuilder.command(`${data.data} banned by ${data.nick}.`, data.timestamp).into(this);
        }
        this.censor(data.data);
    }

    onUNBAN(data) {
        if (this.user.username.toLowerCase() === data.data.toLowerCase()) {
            MessageBuilder.command(`You have been unbanned by ${data.nick}.`, data.timestamp).into(this);
        } else {
            MessageBuilder.command(`${data.data} has been unbanned`, data.timestamp).into(this);
        }
    }

    // NOTE this is an event that the chat server sends `ERR "$error"`
    // not to be confused with an error the chat.source may send onSOCKETERROR.
    onERR(data) {
        if (data === 'toomanyconnections' || data === 'banned') {
            this.source.retryOnDisconnect = false;
        }
        MessageBuilder.error(errorstrings.get(data) || data).into(this, this.getActiveWindow());
    }

    onSOCKETERROR(e) {
        // There is no information on the Error event of the socket.
        // We rely on the socket close event to tell us more about what happened.
        // MessageBuilder.error(errorstrings.get('socketerror')).into(this, this.getActiveWindow())
        // console.error(e)
    }

    onSUBONLY(data) {
        const submode = data.data === 'on' ? 'enabled' : 'disabled';
        MessageBuilder.command(`Subscriber only mode ${submode} by ${data.nick}`, data.timestamp).into(this);
    }

    onBROADCAST(data) {
        const allowRefresh = this.settings.get('allowRefresh') === true;
        if (data.data === 'reload') {            
            if (!this.backlogloading) {
                if(allowRefresh) {
                const retryMilli = Math.floor(Math.random() * 1000) + 1000;
                setTimeout(() => window.location.reload(true), retryMilli);
                return MessageBuilder.broadcast(`Chat will refresh automatically in a moment`).into(this);
                } else return MessageBuilder.broadcast(`The chat was attempted to be forced refreshed but you disabled allowing refreshes.`).into(this);
            }
        } else if (data.data === 'refresh') {
            if (!this.backlogloading) {
                if(allowRefresh) {
                const retryMilli = Math.floor(Math.random() * 1000) + 1000;
                var ifr=parent.document.getElementById('stream-frame');
                setTimeout(() => ifr.src=ifr.src, retryMilli);
                return MessageBuilder.broadcast(`The Stream will automatically refresh in just a moment`).into(this);
                } else return MessageBuilder.broadcast(`The Stream was attempted to be forced refreshed but you disabled Allowing Forced Refreshes.`).into(this);
            }
        } else {
            MessageBuilder.broadcast(data.data, data.timestamp).into(this)
        }
    }

    onPRIVMSGSENT() {
        if (this.mainwindow.visible && !this.settings.get('showhispersinchat')) {
            MessageBuilder.info('Your message has been sent.').into(this);
        }
    }

    onPRIVMSG(data) {
        const normalized = data.nick.toLowerCase();
        if (!this.ignored(normalized, data.data)) {
            if (!this.whispers.has(normalized)) {
                this.whispers.set(normalized, {nick: data.nick, unread: 0, open: false});
            }

            const conv = this.whispers.get(normalized);
            const user = this.users.get(normalized) || new ChatUser(data.nick);
            const messageid = data.hasOwnProperty('messageid') ? data['messageid'] : null;

            if (this.settings.get('showhispersinchat')) {
                MessageBuilder.whisper(data.data, user, this.user.username, data.timestamp, messageid).into(this);
            }

            if (this.settings.get('notificationwhisper') && this.ishidden) {
                Chat.showNotification(`${data.nick} whispered ...`, data.data, data.timestamp, this.settings.get('notificationtimeout'));
            }

            const win = this.getWindow(normalized);
            if (win) {
                MessageBuilder.historical(data.data, user, data.timestamp).into(this, win);
            }

            if (win === this.getActiveWindow()) {
                $.ajax({url: `../../api/messages/msg/${messageid}/open`, method: 'post'});
            } else {
                conv.unread++;
            }

            this.menus.get('whisper-users').redraw();
            this.redrawWindowIndicators();
        }
    }

    /**
     * COMMANDS
     */

    cmdSEND(str) {
        if (str !== '') {
            const win = this.getActiveWindow();

            const isme = str.substring(0, 4).toLowerCase() === '/me ';
            const iscommand = !isme && str.substring(0, 1) === '/' && str.substring(0, 2) !== '//';
            const textonly = Chat.removeSlashCmdFromText(str);

            // strip off `/` if message starts with `//`
            str = str.substring(0, 2) === '//' ? str.substring(1) : str;

            let splittedStr = str.split(' ');
            this.autocomplete.promoteManyLastUsed(splittedStr);
            // COMMAND
            if (iscommand) {
                const command = iscommand ? splittedStr[0] : '';

                const normalized = command.substring(1).toUpperCase();
                if (win !== this.mainwindow && normalized !== 'EXIT') {
                    MessageBuilder.error(`No commands in private windows. Try /exit`).into(this, win);
                } else if (this.control.listeners.has(normalized)) {
                    const parts = (str.substring(command.length + 1) || '').match(/([^ ]+)/g);
                    this.control.emit(normalized, parts || []);
                } else {
                    MessageBuilder.error(`That isn't a command. Try /help`).into(this, win);
                }
                this.inputhistory.add(str);
            } else if (win !== this.mainwindow) { // WHISPER
                MessageBuilder.message(str, this.user).into(this, win);
                this.source.send('PRIVMSG', {nick: win.name, data: str});
            
                        // VOTE
            } else if (this.chatvote.isVoteStarted() && this.chatvote.isMsgVoteCastFmt(textonly)) {
                if (this.chatvote.canVote(this.user.username)) {
                    MessageBuilder.info(`Your vote has been cast!`).into(this)
                    this.source.send('MSG', {data: str})
                    this.input.val('')
                } else {
                    MessageBuilder.error(`You have already voted!`).into(this)
                    this.input.val('')
                }
            
            } else { // MESSAGE
                const textonly = (isme ? str.substring(4) : str).trim();
                if (this.source.isConnected() && !this.emoticons.has(textonly) && !this.emotePrefixes.has(textonly)) {
                    // We add the message to the gui immediately
                    // But we will also get the MSG event, so we need to make sure we dont add the message to the gui again.
                    // We do this by storing the message in the unresolved array
                    // The onMSG then looks in the unresolved array for the message using the nick + message
                    // If found, the message is not added to the gui, its removed from the unresolved array and the message.resolve method is run on the message
                    const message = MessageBuilder.message(str, this.user).into(this);
                    this.unresolved.unshift(message);
                }
                this.source.send('MSG', {data: str});
                this.inputhistory.add(str);
                if(ChatStore.read('chat.unsentMessage') !== null) ChatStore.write('chat.unsentMessage', null);
            }
        }
    }

    cmdVOTE(parts) {
        if (!this.chatvote.isVoteStarted()) {
            if (this.chatvote.canUserStartVote(this.user)) {
                const str = '/vote ' + parts.join(' ')
                this.unresolved.unshift(MessageBuilder.message(str, this.user))
                this.source.send('MSG', {data: str})
                // TODO if the chat isn't connected, the user has no warning of this action failing
            } else {
                MessageBuilder.error('Invalid Permissions').into(this)
            }
        } else {
            MessageBuilder.error('Vote pending').into(this)
        }
    }

    // TODO cmdSend instead?
    cmdVOTESTOP() {
        if (this.chatvote.isVoteStarted()) {
            if (this.chatvote.canUserStartVote(this.user)) {
                const str = '/votestop';
                this.unresolved.unshift(MessageBuilder.message(str, this.user));
                this.source.send('MSG', {data: str});
                MessageBuilder.info(`The poll has been ended early by ${this.user}`).into(this);
                // TODO if the chat isn't connected, the user has no warning of this action failing
            } else {
                MessageBuilder.error('Invalid Permissions').into(this)
            }
        } else {
            MessageBuilder.error('No pending vote').into(this)
        }
    }
    
    cmdEMOTES() {
        MessageBuilder.info(`Available emotes: ${[...this.emoticons].join(', ')}.`).into(this);
    }

    cmdHELP() {
        let str = `Available commands: \r`;
        commandsinfo.forEach((a, k) => {
            str += ` /${k} - ${a.desc} \r`;
        });
        MessageBuilder.info(str).into(this);
    }

    cmdIGNORE(parts) {
        const username = parts[0] || null;
        if (!username) {
            if (this.ignoring.size <= 0) {
                MessageBuilder.info('Your ignore list is empty').into(this);
            } else {
                MessageBuilder.info(`Ignoring the following people: ${Array.from(this.ignoring.values()).join(', ')}`).into(this);
            }
        } else if (!nickregex.test(username)) {
            MessageBuilder.info('Invalid user>').into(this);
        } else if (username.toLowerCase() === this.user.username.toLowerCase()) {
            MessageBuilder.info('Can\'t ignore yourself').into(this);
        } else {
            this.ignore(username, true);
            this.autocomplete.remove(username);
            this.removeMessageByNick(username);
            MessageBuilder.status(`Ignoring ${username}`).into(this);
        }
    }

    cmdUNIGNORE(parts) {
        const username = parts[0] || null;
        if (!username || !nickregex.test(username)) {
            MessageBuilder.error('Invalid user').into(this);
        } else {
            this.ignore(username, false);
            MessageBuilder.status(`${username} has been removed from your ignore list`).into(this);
        }
    }

    cmdMUTE(parts) {
        if (parts.length === 0) {
            MessageBuilder.info(`Usage: /mute userName duration`).into(this);
        } else if (!nickregex.test(parts[0])) {
            MessageBuilder.info(`Invalid username - /mute userName duration`).into(this);
        } else {
            const duration = (parts[1]) ? Chat.parseTimeInterval(parts[1]) : null;
            if (duration && duration > 0) {
                this.source.send('MUTE', {data: parts[0], duration: duration});
            } else {
                this.source.send('MUTE', {data: parts[0]});
            }
        }
    }

    cmdBAN(parts, command) {
        if (parts.length === 0 || parts.length < 3) {
            MessageBuilder.info(`Usage: /${command} userName duration optionalReason (if permanent, type permanent instead of a duration)`).into(this);
        } else if (!nickregex.test(parts[0])) {
            MessageBuilder.info('Invalid username').into(this);
        // } else if (!parts[2]) {
            // MessageBuilder.error('Providing a reason is mandatory').into(this);
        } else {
            let reason;
            if(!parts[2]) reason = 'No Reason Given';
            else reason = parts.slice(2, parts.length).join(' ');
            let payload = {
                nick: parts[0],
                reason: reason
            };
            if (command === 'IPBAN' || /^perm/i.test(parts[1])) { payload.ispermanent = (command === 'IPBAN' || /^perm/i.test(parts[1])); } else { payload.duration = Chat.parseTimeInterval(parts[1]); }
            this.source.send('BAN', payload);
        }
    }

    cmdUNBAN(parts, command) {
        if (parts.length === 0) {
            MessageBuilder.info(`Usage: /${command} userName`).into(this);
        } else if (!nickregex.test(parts[0])) {
            MessageBuilder.info('Invalid username').into(this);
        } else {
            this.source.send(command, {data: parts[0]});
        }
    }

    cmdSUBONLY(parts, command) {
        if (/on|off/i.test(parts[0])) {
            this.source.send(command.toUpperCase(), {data: parts[0].toLowerCase()});
        } else {
            MessageBuilder.error(`Sub-Only Mode - /${command.toLowerCase()} on | off`).into(this);
        }
    }

    cmdMAXLINES(parts, command) {
        if (parts.length === 0) {
            MessageBuilder.info(`Maximum lines stored in Chat (lower may improve performance): ${this.settings.get('maxlines')}`).into(this);
            return;
        }
        const newmaxlines = Math.abs(parseInt(parts[0], 10));
        if (!newmaxlines) {
            MessageBuilder.info(`Maximum lines stores in Chat - /${command} is expecting a number`).into(this);
        } else {
            this.settings.set('maxlines', newmaxlines);
            MessageBuilder.info(`Maximum lines stored in Chat has been set to: ${this.settings.get('maxlines')}`).into(this);
            this.applySettings();
        }
    }

    cmdHIGHLIGHT(parts, command) {
        const highlights = this.settings.get('highlightnicks');
        if (parts.length === 0) {
            if (highlights.length > 0) { MessageBuilder.info('Currently highlighted users: ' + highlights.join(',')).into(this); } else { MessageBuilder.info(`No highlighted users`).into(this); }
            return;
        }
        if (!nickregex.test(parts[0])) {
            MessageBuilder.error(`Invalid username - /${command} userName`).into(this);
        }
        const nick = parts[0].toLowerCase();
        const i = highlights.indexOf(nick);
        switch (command) {
        case 'UNHIGHLIGHT':
            if (i !== -1) highlights.splice(i, 1);
            break;
        default:
        case 'HIGHLIGHT':
            if (i === -1) highlights.push(nick);
            break;
        }
        MessageBuilder.info(command.toUpperCase() === 'HIGHLIGHT' ? `Highlighting ${nick}` : `No longer highlighting ${nick}`).into(this);
        this.settings.set('highlightnicks', highlights);
        this.applySettings();
    }

    cmdTIMESTAMPFORMAT(parts) {
        if (parts.length === 0) {
            MessageBuilder.info(`Current Timestamp Format: ${this.settings.get('timestampformat')} (the default is 'HH:mm', for more info: http://momentjs.com/docs/#/displaying/format/)`).into(this);
        } else {
            const format = parts.slice(1, parts.length);
            if (!/^[a-z :.,-\\*]+$/i.test(format)) {
                MessageBuilder.error('Invalid format, please use: http://momentjs.com/docs/#/displaying/format/').into(this);
            } else {
                MessageBuilder.info(`New Timestamp Format: ${this.settings.get('timestampformat')}`).into(this);
                this.settings.set('timestampformat', format);
                this.applySettings();
            }
        }
    }

    cmdBROADCAST(parts) {
        this.source.send('BROADCAST', {data: parts.join(' ')});
    }

    cmdWHISPER(parts) {
        if (!parts[0] || !nickregex.test(parts[0])) {
            MessageBuilder.error('Invalid username - /w userName message').into(this);
        } else if (parts[0].toLowerCase() === this.user.username.toLowerCase()) {
            MessageBuilder.error('Cannot send a whisper to yourself').into(this);
        } else {
            const data = parts.slice(1, parts.length).join(' ');
            const targetnick = parts[0];
            if (this.settings.get('showhispersinchat')) {
                // show outgoing private messages in chat. Message id unused.
                MessageBuilder.whisperoutgoing(data, this.user, targetnick, Date.now(), -1).into(this);
            }
            this.source.send('PRIVMSG', {nick: targetnick, data: data});
        }
    }
    

    cmdCONNECT(parts) {
        this.source.connect(parts[0]);
    }


    cmdTAG(parts) {
        if (parts.length === 0) {
            if (this.taggednicks.size > 0) {
                MessageBuilder.info(`Tagged users: ${[...this.taggednicks.keys()].join(',')}. Available colors: ${tagcolors.join(',')}`).into(this);
            } else {
                MessageBuilder.info(`No tagged users. Available colors: ${tagcolors.join(',')}`).into(this);
            }
            return;
        }
        if (!nickregex.test(parts[0])) {
            MessageBuilder.error('Invalid username - /tag userName color').into(this);
            return;
        }
        const n = parts[0].toLowerCase();
        if (!this.users.has(n)) {
            MessageBuilder.command('There was an error trying to tag that user. They may need to join chat to be tagged.').into(this);
        }
        const color = parts[1] && tagcolors.indexOf(parts[1]) !== -1 ? parts[1] : tagcolors[Math.floor(Math.random() * tagcolors.length)];
        this.mainwindow.getlines(`.msg-user[data-username="${n}"]`)
            .removeClass(Chat.removeClasses('msg-tagged'))
            .addClass(`msg-tagged msg-tagged-${color}`);
        this.taggednicks.set(n, color);
        MessageBuilder.info(`Tagged ${parts[0]} with the color ${color}`).into(this);

        this.settings.set('taggednicks', [...this.taggednicks]);
        // TODO this reinitialized the whole user menu on a tag change. We could only modify the right entry here instead. Same in cmdUNTAG().
        this.menus.get('users').addAll();
        this.applySettings();
    }

    cmdUNTAG(parts) {
        if (parts.length === 0) {
            if (this.taggednicks.size > 0) {
                MessageBuilder.info(`Tagged users: ${[...this.taggednicks.keys()].join(',')}. Available colors: ${tagcolors.join(',')}`).into(this);
            } else {
                MessageBuilder.info(`No tagged users. Available colors: ${tagcolors.join(',')}`).into(this);
            }
            return;
        }
        if (!nickregex.test(parts[0])) {
            MessageBuilder.error('Invalid nick - /untag <nick> <color>').into(this);
            return;
        }
        const n = parts[0].toLowerCase();
        this.taggednicks.delete(n);
        this.mainwindow
            .getlines(`.msg-chat[data-username="${n}"]`)
            .removeClass(Chat.removeClasses('msg-tagged'));
        MessageBuilder.info(`Un-tagged ${n}`).into(this);
        this.settings.set('taggednicks', [...this.taggednicks]);
        this.menus.get('users').addAll();
        this.applySettings();
    }

    cmdBANINFO() { // > TODO CALL WHEN NOT PERMA BANNED
        MessageBuilder.info('Loading ban info . . .').into(this);
        $.ajax({url: `../../api/chat/me/ban`})
            .done(d => {
                if (d === 'bannotfound') {
                    MessageBuilder.info(`You have no active bans.`).into(this);
                    return;
                }
                const b = $.extend({}, banstruct, d);
                const by = b.username ? b.username : 'Chat';
                const start = moment(b.starttimestamp).format(DATE_FORMATS.FULL);
                if (!b.endtimestamp) {
                    MessageBuilder.info(`Permanent ban by ${by} started on ${start}.`).into(this);
                } else {
                    const end = moment(b.endtimestamp).calendar();
                    MessageBuilder.info(`Temporary ban by ${by} started on ${start} and ending by ${end}`).into(this);
                }
                if (b.reason) {
                    const m = MessageBuilder.message(b.reason, new ChatUser(by), b.starttimestamp);
                    m.historical = true;
                    m.into(this);
                }
                MessageBuilder.info(`End of ban information`).into(this);
            })
            .fail(() => MessageBuilder.error('Error loading ban info. Check your profile.').into(this));
    }

    cmdEXIT() {
        const win = this.getActiveWindow();
        if (win !== this.mainwindow) {
            this.windowToFront(this.mainwindow.name);
            this.removeWindow(win.name);
        }
    }

    openConversation(nick) {
        const normalized = nick.toLowerCase();

        const conv = this.whispers.get(normalized);
        if (conv) {
            ChatMenu.closeMenus(this);
            this.windows.has(normalized) || this.createConversation(conv, nick, normalized);
            this.windowToFront(normalized);
            this.menus.get('whisper-users').redraw();
            this.input.focus();
        }
    }

    createConversation(conv, nick, normalized) {
        const user = this.users.get(normalized) || new ChatUser(nick);

        const win = new ChatWindow(normalized, 'chat-output-whisper', user.nick).into(this);
        let once = true;
        win.on('show', () => {
            if (once) {
                once = false;
                MessageBuilder.info(
                    `Messages between you and ${nick}\r`/* +
                    `Enter /close to exit this conversation, click the round icons below and center of the chat input to toggle between them, \r`+
                    `or close them from the whispers menu.\r`+
                    `Loading messages ...` */
                ).into(this, win);
                $.ajax({url: `../../api/messages/usr/${encodeURIComponent(user.nick)}/inbox`})
                    .fail(() => MessageBuilder.error(`Failed to load messages :(`).into(this, win))
                    .done(data => {
                        if (data.length > 0) {
                            const date = moment(data[0].timestamp).format(DATE_FORMATS.FULL);
                            MessageBuilder.info(`Last message ${date}`).into(this, win);
                            data.reverse().forEach(e => {
                                const user = this.users.get(e['from'].toLowerCase()) || new ChatUser(e['from']);
                                MessageBuilder.historical(e.message, user, e.timestamp).into(this, win);
                            });
                        }
                    });
            }
            conv.unread = 0;
            conv.open = true;
        });
        win.on('hide', () => { conv.open = false; });
    }

    static extractTextOnly(msg) {
        return (msg.substring(0, 4).toLowerCase() === '/me ' ? msg.substring(4) : msg).trim();
    }
    
    static removeSlashCmdFromText(msg){
        return msg.replace(regexslashcmd, '').trim();
    }
    
    static remoteSlashCmdFromText(msg){
        return (msg.substring(0, 4).toLowerCase() === '/me ' ? msg.substring(4) : msg).trim();	        if (msg[0] === '/') {
            return msg.replace(/^\/[A-z]+ /, '')
        }
        return msg;
    }	    

    static extractNicks(text) {
        let nicks = new Set();
        let match;
        // eslint-disable-next-line no-cond-assign
        while (match = nickmessageregex.exec(text)) {
            nicks.add(match[1]);
        }
        return [...nicks];
    }

    static removeClasses(search) {
        return function(i, c) {
            return (c.match(new RegExp(`\\b${search}(?:[A-z-]+)?\\b`, 'g')) || []).join(' ');
        };
    }

    static isArraysEqual(a, b) {
        return (!a || !b) ? (a.length !== b.length || a.sort().toString() !== b.sort().toString()) : false;
    }

    static showNotification(title, message, timestamp, timeout = false) {
        if (Notification.permission === 'granted') {
            const n = new Notification(title, {
                body: message,
                tag: `${this.chat.config.meta['title']} - Chat ${timestamp}`,
                icon: require('../img/notify-icon.png'),
                dir: 'auto'
            });
            if (timeout) setTimeout(() => n.close(), 8000);
        }
    }

    static makeSafeForRegex(str) {
        return str.trim().replace(regexsafe, '\\$&');
    }

    static parseTimeInterval(str) {
        let nanoseconds = 0;

        let units = {
            s: 1000000000,
            sec: 1000000000,
            secs: 1000000000,
            second: 1000000000,
            seconds: 1000000000,

            m: 60000000000,
            min: 60000000000,
            mins: 60000000000,
            minute: 60000000000,
            minutes: 60000000000,

            h: 3600000000000,
            hr: 3600000000000,
            hrs: 3600000000000,
            hour: 3600000000000,
            hours: 3600000000000,

            d: 86400000000000,
            day: 86400000000000,
            days: 86400000000000
        };
        str.replace(regextime, function($0, number, unit) {
            number *= (unit) ? units[unit.toLowerCase()] || units.s : units.s;
            nanoseconds += +number;
        });
        return nanoseconds;
    }

    static reqParam(name, url) {
        name = name.replace(/[\[\]]/g, "\\$&");
        url = location || window.location.href || null;
        const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results || !results[2]) return null;
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    static extractHostname(url) {
        let hostname = url.indexOf("://") > -1? url.split('/')[2]: url.split('/')[0];
        hostname = hostname.split(':')[0];
        hostname = hostname.split('?')[0];
        return hostname;
    }

    static loadCss(url) {
        const link = document.createElement('link');
        link.href = url;
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.media = 'screen';
        document.getElementsByTagName('head')[0].appendChild(link);
        return link;
    }

    
}

export default Chat;

