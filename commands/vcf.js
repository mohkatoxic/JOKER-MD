const chalk = require('chalk');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const settings = require('../settings');

async function vcfCommand(sock, chatId, message) {
    try {
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedMessage = contextInfo?.quotedMessage;
        const documentMessage = quotedMessage?.documentMessage;
        
        const isGroup = chatId.endsWith('@g.us');
        const contactList = [];

        // --- MODE A: USER REPLIED TO A VCF DOCUMENT FILE (EXTRACTOR MODE) ---
        if (documentMessage) {
            await sock.sendMessage(chatId, { react: { text: "⏳", key: message.key } });

            const stream = await downloadContentFromMessage(documentMessage, 'document');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            const vcfContent = buffer.toString('utf-8');
            const vcardBlocks = vcfContent.split(/BEGIN:VCARD/i);

            for (const block of vcardBlocks) {
                if (!block.trim()) continue;

                const fnMatch = block.match(/FN(?:;[^:]*)?:(.*)/i);
                const nMatch = block.match(/N(?:;[^:]*)?:(.*)/i);
                let rawName = fnMatch ? fnMatch[1] : (nMatch ? nMatch[1].replace(/;/g, ' ') : '');
                rawName = rawName.trim();

                const telMatches = block.matchAll(/TEL(?:;[^:]*)?:(.*)/gi);
                for (const match of telMatches) {
                    let cleanNum = match[1].replace(/[^0-9]/g, '');
                    if (cleanNum.length >= 7) {
                        const targetJid = `${cleanNum}@s.whatsapp.net`;
                        const resolvedName = rawName || `Unsaved ${cleanNum}`;
                        const finalName = rawName || `Contact ${cleanNum}`;

                        // Custom structures requested
                        contactList.push({ jid: targetJid, name: `ʲⁿʳ_₀₁ ${resolvedName} 👤` });
                        contactList.push({ jid: targetJid, name: `ʲⁿʳ_₀₁ ${finalName} 💫` });
                    }
                }
            }
        } 
        // --- MODE B: RUN INSIDE A GROUP CHAT (GROUP SCRAPER MODE) ---
        else if (isGroup) {
            await sock.sendMessage(chatId, { react: { text: "📥", key: message.key } });

            // Fetch live metadata of the group members
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants;

            for (const participant of participants) {
                const targetJid = participant.id;
                const cleanNum = targetJid.split('@')[0]; // Extracting real WhatsApp number
                
                // Get name from bot's store or pushName if available, fallback safely
                let rawName = participant.name || participant.notify || `GroupMember ${cleanNum}`;
                rawName = rawName.trim();

                const resolvedName = rawName;
                const finalName = rawName;

                // Custom structures requested
                contactList.push({ jid: targetJid, name: `ʲⁿʳ_₀₁ ${resolvedName} 👤` });
                contactList.push({ jid: targetJid, name: `ʲⁿʳ_₀₁ ${finalName} 💫` });
            }
        } 
        // --- NO RUNNING CONTEXT ---
        else {
            return await sock.sendMessage(chatId, { 
                text: `❌ Use this command inside a *Group Chat* to backup members, or *Reply to a VCF File* to extract numbers.` 
            }, { quoted: message });
        }

        // --- FILE GENERATION & DELIVERY ---
        if (contactList.length === 0) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
            return await sock.sendMessage(chatId, { text: "❌ No valid contacts or group numbers could be compiled." }, { quoted: message });
        }

        // Deduplicate using contact names to ensure neatness
        const uniqueEntries = Array.from(new Map(contactList.map(item => [item.name, item])).values());

        let newVcfData = '';
        for (const entry of uniqueEntries) {
            const rawPhoneNumber = entry.jid.split('@')[0];
            newVcfData += `BEGIN:VCARD\nVERSION:3.0\nFN:${entry.name}\nTEL;TYPE=CELL:+${rawPhoneNumber}\nEND:VCARD\n`;
        }

        const outputDirectory = './data';
        const outputFilename = `Jnr_Contacts_${Date.now()}.vcf`;
        const outputPath = path.join(outputDirectory, outputFilename);

        await fs.ensureDir(outputDirectory);
        await fs.writeFile(outputPath, newVcfData);

        await sock.sendMessage(chatId, { react: { text: "✅", key: message.key } });
        
        await sock.sendMessage(chatId, {
            document: { url: outputPath },
            mimetype: 'text/vcard',
            fileName: outputFilename,
            caption: `✅ *VCF Compiled Successfully!*\n\n📊 *Total Extracted Entries:* ${contactList.length}\n✨ *Unique Formatted Contacts:* ${uniqueEntries.length}\n\nAll real WhatsApp numbers have been packaged with your custom tags.`
        }, { quoted: message });

        // Storage clean up
        setTimeout(() => fs.unlink(outputPath).catch(() => {}), 10000);

    } catch (err) {
        console.error(chalk.red('[ERROR] in vcf command:'), err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: message.key } });
        await sock.sendMessage(chatId, { text: "❌ An error occurred while processing the contact structures." }, { quoted: message });
    }
}

module.exports = { vcfCommand };