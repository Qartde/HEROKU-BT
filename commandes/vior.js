const { zokou } = require("../framework/zokou");
const conf = require("../set");
const fs = require("fs-extra");
const path = require("path");

zokou({
    nomCom: "vv",
    categorie: "General",
    reaction: "👁️",
    desc: "Save view once media (sends to owner DM)",
    fromMe: true
}, async (dest, zk, commandeOptions) => {
    const { ms, msgRepondu, repondre, auteurMessage, superUser } = commandeOptions;

    // Check if replying to a message
    if (!msgRepondu) {
        return repondre("❌ *Reply to a view once message!*");
    }

    try {
        // Get the actual message content
        let content = msgRepondu;
        
        // Unwrap view once if present
        if (msgRepondu.viewOnceMessageV2) {
            content = msgRepondu.viewOnceMessageV2.message;
        } else if (msgRepondu.viewOnceMessage) {
            content = msgRepondu.viewOnceMessage.message;
        } else if (msgRepondu.message?.viewOnceMessageV2) {
            content = msgRepondu.message.viewOnceMessageV2.message;
        } else if (msgRepondu.message?.viewOnceMessage) {
            content = msgRepondu.message.viewOnceMessage.message;
        }

        // Check for different media types
        let mediaMsg = null;
        let type = '';
        
        // Extended media type checking
        if (content?.imageMessage) {
            mediaMsg = content.imageMessage;
            type = 'image';
        } else if (content?.videoMessage) {
            mediaMsg = content.videoMessage;
            type = 'video';
        } else if (content?.audioMessage) {
            mediaMsg = content.audioMessage;
            type = 'audio';
        } else if (content?.stickerMessage) {
            mediaMsg = content.stickerMessage;
            type = 'sticker';
        } else if (content?.documentMessage) {
            mediaMsg = content.documentMessage;
            type = 'document';
        }

        if (!mediaMsg) {
            return repondre("❌ *Not a view once message or unsupported media type!*");
        }

        // Check if it's actually view once
        const isViewOnce = mediaMsg?.viewOnce === true || 
                          mediaMsg?.isViewOnce === true ||
                          content?.viewOnceMessageV2 ||
                          content?.viewOnceMessage;

        if (!isViewOnce && type !== 'sticker') {
            return repondre("❌ *This is not a view once message!*");
        }

        await repondre(`⏳ *Downloading ${type}...*`);

        // Download media with error handling
        let mediaPath;
        try {
            mediaPath = await zk.downloadAndSaveMediaMessage(mediaMsg);
            if (!mediaPath || !fs.existsSync(mediaPath)) {
                throw new Error("Download failed");
            }
        } catch (downloadError) {
            console.error("Download error:", downloadError);
            return repondre("❌ *Failed to download media!*");
        }

        // Determine owner JID
        const ownerJid = conf.NUMERO_OWNER + "@s.whatsapp.net";
        const sender = auteurMessage.split('@')[0];
        const timestamp = new Date().toLocaleString();

        // Prepare caption
        const caption = `🗑️ *VIEW ONCE ${type.toUpperCase()}*\n\n👤 *From:* @${sender}\n📱 *JID:* ${auteurMessage}\n🕐 *Time:* ${timestamp}\n💬 *Type:* ${type}`;

        // Send to owner based on type
        let success = false;
        
        try {
            if (type === 'image') {
                await zk.sendMessage(ownerJid, {
                    image: fs.readFileSync(mediaPath),
                    caption: caption,
                    mentions: [auteurMessage]
                });
                success = true;
            } 
            else if (type === 'video') {
                await zk.sendMessage(ownerJid, {
                    video: fs.readFileSync(mediaPath),
                    caption: caption,
                    mentions: [auteurMessage]
                });
                success = true;
            } 
            else if (type === 'audio') {
                await zk.sendMessage(ownerJid, {
                    audio: fs.readFileSync(mediaPath),
                    mimetype: 'audio/mp4',
                    ptt: false
                });
                await zk.sendMessage(ownerJid, {
                    text: caption,
                    mentions: [auteurMessage]
                });
                success = true;
            } 
            else if (type === 'sticker') {
                await zk.sendMessage(ownerJid, {
                    sticker: fs.readFileSync(mediaPath)
                });
                await zk.sendMessage(ownerJid, {
                    text: caption,
                    mentions: [auteurMessage]
                });
                success = true;
            }
            else if (type === 'document') {
                await zk.sendMessage(ownerJid, {
                    document: fs.readFileSync(mediaPath),
                    mimetype: mediaMsg.mimetype,
                    fileName: mediaMsg.fileName || `view_once_${Date.now()}`,
                    caption: caption
                });
                success = true;
            }
        } catch (sendError) {
            console.error("Send error:", sendError);
            return repondre("❌ *Failed to send to owner!*");
        }

        // Clean up - delete temporary file
        try {
            if (fs.existsSync(mediaPath)) {
                fs.unlinkSync(mediaPath);
            }
        } catch (cleanError) {
            console.error("Cleanup error:", cleanError);
        }

        if (success) {
            await repondre(`✅ *View once ${type} saved and sent to owner DM!*\n\n📩 *Check your DM @${conf.NUMERO_OWNER}*`, {
                mentions: [ownerJid]
            });
        } else {
            await repondre("❌ *Failed to process view once message!*");
        }

    } catch (error) {
        console.error("❌ Detailed error:", error);
        await repondre(`❌ *Error:* ${error.message}\n\n*Report this error to your owner*`);
    }
});
