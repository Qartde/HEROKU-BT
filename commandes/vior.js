const { zokou } = require("../framework/zokou");
const conf = require("../set");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

zokou({
    nomCom: "vv",
    categorie: "General",
    reaction: "👁️",
    desc: "Save view once media (sends to owner DM)",
    fromMe: true
}, async (dest, zk, commandeOptions) => {
    const { ms, repondre, auteurMessage } = commandeOptions;

    try {
        // Get quoted message from contextInfo
        const contextInfo = ms?.message?.extendedTextMessage?.contextInfo
                         || ms?.message?.imageMessage?.contextInfo
                         || ms?.message?.videoMessage?.contextInfo
                         || ms?.message?.audioMessage?.contextInfo;

        const quotedMessage = contextInfo?.quotedMessage;

        if (!quotedMessage) {
            return repondre("❌ *Reply to a view once message!*");
        }

        // Detect media type
        let type = '';
        let mediaMsg = null;

        if (quotedMessage.imageMessage) {
            type = 'image';
            mediaMsg = quotedMessage.imageMessage;
        } else if (quotedMessage.videoMessage) {
            type = 'video';
            mediaMsg = quotedMessage.videoMessage;
        } else if (quotedMessage.audioMessage) {
            type = 'audio';
            mediaMsg = quotedMessage.audioMessage;
        } else if (quotedMessage.stickerMessage) {
            type = 'sticker';
            mediaMsg = quotedMessage.stickerMessage;
        } else {
            return repondre("❌ *Not a supported view once message!*");
        }

        await repondre(`⏳ *Downloading ${type}...*`);

        // Build message for download using quotedMessage + stanzaId as key
        const msgForDownload = {
            key: {
                remoteJid: dest,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant
            },
            message: quotedMessage
        };

        // Download using Baileys
        const mediaBuffer = await downloadMediaMessage(
            msgForDownload,
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: zk.updateMediaMessage
            }
        );

        if (!mediaBuffer || mediaBuffer.length === 0) {
            return repondre("❌ *Download failed — empty buffer!*");
        }

        const fileSizeMB = (mediaBuffer.length / 1024 / 1024).toFixed(2);

        // Owner info
        const ownerJid = conf.NUMERO_OWNER + "@s.whatsapp.net";
        const sender = (contextInfo.participant || auteurMessage).split('@')[0];
        const caption = `👁️ *VIEW ONCE ${type.toUpperCase()}*\n👤 *From:* @${sender}\n💾 *Size:* ${fileSizeMB} MB`;

        const mimeMap = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg', sticker: 'image/webp' };
        const mime = mediaMsg?.mimetype || mimeMap[type];

        // Send to owner
        if (type === 'image') {
            await zk.sendMessage(ownerJid, {
                image: mediaBuffer,
                caption,
                mentions: [auteurMessage]
            });
        } else if (type === 'video') {
            await zk.sendMessage(ownerJid, {
                video: mediaBuffer,
                caption,
                mentions: [auteurMessage]
            });
        } else if (type === 'audio') {
            await zk.sendMessage(ownerJid, { audio: mediaBuffer, mimetype: mime, ptt: false });
            await zk.sendMessage(ownerJid, { text: caption, mentions: [auteurMessage] });
        } else if (type === 'sticker') {
            await zk.sendMessage(ownerJid, { sticker: mediaBuffer });
            await zk.sendMessage(ownerJid, { text: caption, mentions: [auteurMessage] });
        }

        await repondre(`✅ *View once ${type} sent to owner DM!*\n💾 *Size:* ${fileSizeMB} MB`);

    } catch (error) {
        console.error("❌ VV Error:", error);
        await repondre(`❌ *Error:* ${error.message}`);
    }
});
