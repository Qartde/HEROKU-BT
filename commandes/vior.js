const { zokou } = require("../framework/zokou");
const conf = require("../set");
const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

zokou({
    nomCom: "vv",
    categorie: "General",
    reaction: "👁️",
    desc: "Save view once media (sends to owner DM)",
    fromMe: true
}, async (dest, zk, commandeOptions) => {
    const { ms, msgRepondu, repondre, auteurMessage, client } = commandeOptions;

    if (!msgRepondu) {
        return repondre("❌ *Reply to a view once message!*");
    }

    await repondre("⏳ *Processing view once message...*");

    try {
        // Get the actual message content
        let content = msgRepondu;
        
        // Unwrap view once
        if (msgRepondu.viewOnceMessageV2) {
            content = msgRepondu.viewOnceMessageV2.message;
        } else if (msgRepondu.viewOnceMessage) {
            content = msgRepondu.viewOnceMessage.message;
        } else if (msgRepondu.message?.viewOnceMessageV2) {
            content = msgRepondu.message.viewOnceMessageV2.message;
        } else if (msgRepondu.message?.viewOnceMessage) {
            content = msgRepondu.message.viewOnceMessage.message;
        }

        // Check for media types
        let mediaMsg = null;
        let type = '';
        
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
        }

        if (!mediaMsg) {
            return repondre("❌ *Not a view once message!*");
        }

        // Method 1: Try direct download using client
        let mediaBuffer = null;
        
        try {
            // Try using the client's download method
            mediaBuffer = await client.downloadMediaMessage(mediaMsg);
        } catch (err1) {
            console.log("Client download failed, trying alternative:", err1.message);
            
            // Method 2: Try using message key
            try {
                const messageKey = {
                    remoteJid: dest,
                    id: ms.key.id,
                    fromMe: false
                };
                mediaBuffer = await client.downloadMediaMessage(messageKey);
            } catch (err2) {
                console.log("Message key download failed:", err2.message);
                
                // Method 3: Try direct URL if available
                if (mediaMsg.directPath) {
                    try {
                        const stream = await client.downloadContentFromMessage(mediaMsg, type);
                        const chunks = [];
                        for await (const chunk of stream) {
                            chunks.push(chunk);
                        }
                        mediaBuffer = Buffer.concat(chunks);
                    } catch (err3) {
                        throw new Error("All download methods failed");
                    }
                }
            }
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
            return repondre("❌ *Failed to download media!*");
        }

        const fileSizeMB = (mediaBuffer.length / 1024 / 1024).toFixed(2);
        await repondre(`✅ *Media downloaded!* (${fileSizeMB} MB)\n📤 *Sending to owner...*`);

        // Owner info
        const ownerJid = conf.NUMERO_OWNER + "@s.whatsapp.net";
        const sender = auteurMessage.split('@')[0];
        const timestamp = new Date().toLocaleString();

        const caption = `🗑️ *VIEW ONCE ${type.toUpperCase()}*\n\n👤 *From:* @${sender}\n🕐 *Time:* ${timestamp}\n📦 *Size:* ${fileSizeMB} MB`;

        // Send to owner with multiple methods
        let sent = false;
        
        // Method A: Try sending as document (most reliable)
        try {
            const fileName = `view_once_${type}_${Date.now()}.${type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'webp'}`;
            
            await client.sendMessage(ownerJid, {
                document: mediaBuffer,
                mimetype: mediaMsg.mimetype || (type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/webp'),
                fileName: fileName,
                caption: caption,
                mentions: [auteurMessage]
            });
            sent = true;
            await repondre("✅ *Sent as document*");
        } catch (docError) {
            console.log("Document send failed:", docError.message);
            
            // Method B: Try sending as normal media (for smaller files)
            if (mediaBuffer.length < 15 * 1024 * 1024) { // Less than 15MB
                try {
                    if (type === 'image') {
                        await client.sendMessage(ownerJid, {
                            image: mediaBuffer,
                            caption: caption,
                            mentions: [auteurMessage]
                        });
                    } else if (type === 'video') {
                        await client.sendMessage(ownerJid, {
                            video: mediaBuffer,
                            caption: caption,
                            mentions: [auteurMessage]
                        });
                    } else if (type === 'audio') {
                        await client.sendMessage(ownerJid, {
                            audio: mediaBuffer,
                            mimetype: 'audio/mpeg'
                        });
                        await client.sendMessage(ownerJid, { text: caption, mentions: [auteurMessage] });
                    } else if (type === 'sticker') {
                        await client.sendMessage(ownerJid, { sticker: mediaBuffer });
                        await client.sendMessage(ownerJid, { text: caption, mentions: [auteurMessage] });
                    }
                    sent = true;
                    await repondre("✅ *Sent as media*");
                } catch (mediaError) {
                    console.log("Media send failed:", mediaError.message);
                }
            }
            
            // Method C: Last resort - save to file and send link
            if (!sent) {
                try {
                    const tempDir = path.join(__dirname, "../temp");
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                    
                    const filePath = path.join(tempDir, `view_once_${Date.now()}_${type}.${type === 'image' ? 'jpg' : 'mp4'}`);
                    fs.writeFileSync(filePath, mediaBuffer);
                    
                    // Upload to a temporary hosting or send as file
                    await client.sendMessage(ownerJid, {
                        text: `⚠️ *Couldn't send media directly*\n\n${caption}\n\n📁 *File saved locally:* ${filePath}\n💾 *Size:* ${fileSizeMB} MB\n\n*Download manually from server*`,
                        mentions: [auteurMessage]
                    });
                    sent = true;
                } catch (fileError) {
                    console.log("File save failed:", fileError.message);
                }
            }
        }

        if (sent) {
            await repondre(`✅ *View once ${type} saved successfully!*\n\n📩 *Sent to owner DM*\n💾 *Size:* ${fileSizeMB} MB`);
        } else {
            // Emergency: Send just the info
            await client.sendMessage(ownerJid, {
                text: `🚨 *VIEW ONCE MEDIA DETECTED*\n\n👤 *From:* @${sender}\n📱 *JID:* ${auteurMessage}\n🕐 *Time:* ${timestamp}\n📦 *Type:* ${type}\n⚠️ *Size:* ${fileSizeMB} MB\n❌ *Auto-save failed - check manually*`,
                mentions: [auteurMessage]
            });
            await repondre(`⚠️ *View once ${type} detected but couldn't save!*\n\n*Info sent to owner DM*`);
        }

    } catch (error) {
        console.error("❌ Error:", error);
        await repondre(`❌ *Error:* ${error.message}\n\n*Report to owner*`);
    }
});
