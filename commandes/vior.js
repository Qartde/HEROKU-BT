const { zokou } = require("../framework/zokou");
const conf = require("../set");
const fs = require("fs-extra");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

zokou({
    nomCom: "vv",
    categorie: "General",
    reaction: "👁️",
    desc: "Save view once media (sends to owner DM)",
    fromMe: true
}, async (dest, zk, commandeOptions) => {
    const { ms, msgRepondu, repondre, auteurMessage } = commandeOptions;

    if (!msgRepondu) {
        return repondre("❌ *Reply to a view once message!*");
    }

    await repondre("⏳ *Processing view once message...*");

    try {
        // Unwrap view once from the replied message
        let content = ms.message;

        if (content?.viewOnceMessageV2) {
            content = content.viewOnceMessageV2.message;
        } else if (content?.viewOnceMessage) {
            content = content.viewOnceMessage.message;
        } else if (content?.ephemeralMessage?.message?.viewOnceMessageV2) {
            content = content.ephemeralMessage.message.viewOnceMessageV2.message;
        } else if (content?.ephemeralMessage?.message?.viewOnceMessage) {
            content = content.ephemeralMessage.message.viewOnceMessage.message;
        } else {
            // Try from msgRepondu directly
            let alt = msgRepondu;
            if (alt?.viewOnceMessageV2) {
                content = alt.viewOnceMessageV2.message;
            } else if (alt?.viewOnceMessage) {
                content = alt.viewOnceMessage.message;
            } else if (alt?.message?.viewOnceMessageV2) {
                content = alt.message.viewOnceMessageV2.message;
            } else if (alt?.message?.viewOnceMessage) {
                content = alt.message.viewOnceMessage.message;
            } else {
                return repondre("❌ *Not a view once message!*");
            }
        }

        // Detect media type
        let type = '';
        if (content?.imageMessage) {
            type = 'image';
        } else if (content?.videoMessage) {
            type = 'video';
        } else if (content?.audioMessage) {
            type = 'audio';
        } else if (content?.stickerMessage) {
            type = 'sticker';
        } else {
            return repondre("❌ *No supported media found in view once message!*");
        }

        // Build message object for download
        const msgForDownload = {
            key: ms.key,
            message: content
        };

        // Download media using Baileys built-in method
        let mediaBuffer = null;
        try {
            mediaBuffer = await downloadMediaMessage(
                msgForDownload,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: zk.updateMediaMessage
                }
            );
        } catch (dlErr) {
            console.error("downloadMediaMessage failed:", dlErr.message);
            throw new Error("Could not download media: " + dlErr.message);
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
            return repondre("❌ *Failed to download media — buffer empty!*");
        }

        const fileSizeMB = (mediaBuffer.length / 1024 / 1024).toFixed(2);
        await repondre(`✅ *Media downloaded!* (${fileSizeMB} MB)\n📤 *Sending to owner...*`);

        // Owner info
        const ownerJid = conf.NUMERO_OWNER + "@s.whatsapp.net";
        const sender = auteurMessage.split('@')[0];
        const timestamp = new Date().toLocaleString();
        const caption = `👁️ *VIEW ONCE ${type.toUpperCase()}*\n\n👤 *From:* @${sender}\n🕐 *Time:* ${timestamp}\n📦 *Size:* ${fileSizeMB} MB`;

        const mimeMap = {
            image: 'image/jpeg',
            video: 'video/mp4',
            audio: 'audio/mpeg',
            sticker: 'image/webp'
        };
        const extMap = {
            image: 'jpg',
            video: 'mp4',
            audio: 'mp3',
            sticker: 'webp'
        };

        let sent = false;

        // Method A: Send as document (most reliable)
        try {
            const mediaMsg = content[`${type}Message`];
            const fileName = `view_once_${type}_${Date.now()}.${extMap[type]}`;
            await zk.sendMessage(ownerJid, {
                document: mediaBuffer,
                mimetype: mediaMsg?.mimetype || mimeMap[type],
                fileName: fileName,
                caption: caption,
                mentions: [auteurMessage]
            });
            sent = true;
        } catch (docErr) {
            console.log("Document send failed:", docErr.message);
        }

        // Method B: Send as original media type
        if (!sent) {
            try {
                const mediaMsg = content[`${type}Message`];
                const mime = mediaMsg?.mimetype || mimeMap[type];

                if (type === 'image') {
                    await zk.sendMessage(ownerJid, {
                        image: mediaBuffer,
                        caption: caption,
                        mentions: [auteurMessage]
                    });
                } else if (type === 'video') {
                    await zk.sendMessage(ownerJid, {
                        video: mediaBuffer,
                        caption: caption,
                        mentions: [auteurMessage]
                    });
                } else if (type === 'audio') {
                    await zk.sendMessage(ownerJid, {
                        audio: mediaBuffer,
                        mimetype: mime,
                        ptt: false
                    });
                    await zk.sendMessage(ownerJid, {
                        text: caption,
                        mentions: [auteurMessage]
                    });
                } else if (type === 'sticker') {
                    await zk.sendMessage(ownerJid, { sticker: mediaBuffer });
                    await zk.sendMessage(ownerJid, {
                        text: caption,
                        mentions: [auteurMessage]
                    });
                }
                sent = true;
            } catch (mediaErr) {
                console.log("Media send failed:", mediaErr.message);
            }
        }

        // Method C: Save locally and notify owner
        if (!sent) {
            try {
                const tempDir = path.join(__dirname, "../temp");
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                const filePath = path.join(tempDir, `view_once_${Date.now()}.${extMap[type]}`);
                fs.writeFileSync(filePath, mediaBuffer);

                await zk.sendMessage(ownerJid, {
                    text: `⚠️ *Couldn't send media directly*\n\n${caption}\n\n📁 *Saved locally:* ${filePath}`,
                    mentions: [auteurMessage]
                });
                sent = true;
            } catch (fileErr) {
                console.log("File save failed:", fileErr.message);
            }
        }

        if (sent) {
            await repondre(`✅ *View once ${type} saved successfully!*\n📩 *Sent to owner DM*\n💾 *Size:* ${fileSizeMB} MB`);
        } else {
            await zk.sendMessage(ownerJid, {
                text: `🚨 *VIEW ONCE DETECTED — AUTO SAVE FAILED*\n\n👤 *From:* @${sender}\n📱 *JID:* ${auteurMessage}\n🕐 *Time:* ${timestamp}\n📦 *Type:* ${type}\n⚠️ *Size:* ${fileSizeMB} MB`,
                mentions: [auteurMessage]
            });
            await repondre(`⚠️ *Detected but couldn't save!*\n*Info sent to owner DM*`);
        }

    } catch (error) {
        console.error("❌ VV Error:", error);
        await repondre(`❌ *Error:* ${error.message}\n\n*Report to owner*`);
    }
});
