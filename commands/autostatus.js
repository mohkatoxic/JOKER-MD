const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');
const settings = require('../settings'); // Import settings config

// Dynamically generate the newsletter context info on each call
function getChannelInfo() {
    // Falls back to global configuration if settings file lacks the botName property
    const currentBotName = global.botname || settings.botName || 'JOKER';
    
    return {
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363428288475430@newsletter',
                // Updates dynamically with decoration style wrappers matching your branding
                newsletterName: `${currentBotName.toUpperCase()}`,
                serverMessageId: -1
            }
        }
    };
}

// Path to store auto status configuration
const configPath = path.join(__dirname, '../data/autoStatus.json');

// Initialize config file if it doesn't exist
if (!fs.existsSync(configPath)) {
    // Ensure data directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify({ 
        enabled: false, 
        reactOn: false,
        reaction: '💚' 
    }, null, 2));
}

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const senderId = msg.key.participant || msg.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used by the owner!',
                ...getChannelInfo()
            });
            return;
        }

        // Read current config
        let config = JSON.parse(fs.readFileSync(configPath));

        // If no arguments, show current status
        if (!args || args.length === 0) {
            const status = config.enabled ? 'enabled' : 'disabled';
            const reactStatus = config.reactOn ? 'enabled' : 'disabled';
            const currentReaction = config.reaction || '💚';
            
            await sock.sendMessage(chatId, { 
                text: `🔄 *Auto Status Settings*\n\n📱 *Auto Status View:* ${status}\n💫 *Status Reactions:* ${reactStatus}\n😀 *Reaction Emoji:* ${currentReaction}\n\n*Commands:*\n.autostatus on - Enable auto status view\n.autostatus off - Disable auto status view\n.autostatus react on - Enable status reactions\n.autostatus react off - Disable status reactions\n.autostatus reaction <emoji> - Change reaction emoji`,
                ...getChannelInfo()
            });
            return;
        }

        // Handle subcommands
        const command = args[0].toLowerCase();
        
        if (command === 'on') {
            config.enabled = true;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            await sock.sendMessage(chatId, { 
                text: '✅ Auto status view has been enabled!\nBot will now automatically view all contact statuses.',
                ...getChannelInfo()
            });
        } else if (command === 'off') {
            config.enabled = false;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            await sock.sendMessage(chatId, { 
                text: '❌ Auto status view has been disabled!\nBot will no longer automatically view statuses.',
                ...getChannelInfo()
            });
        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Please specify on/off for reactions!\nUse: .autostatus react on/off',
                    ...getChannelInfo()
                });
                return;
            }
            
            const reactCommand = args[1].toLowerCase();
            if (reactCommand === 'on') {
                config.reactOn = true;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                await sock.sendMessage(chatId, { 
                    text: '💫 Status reactions have been enabled!\nBot will now react to status updates.',
                    ...getChannelInfo()
                });
            } else if (reactCommand === 'off') {
                config.reactOn = false;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                await sock.sendMessage(chatId, { 
                    text: '❌ Status reactions have been disabled!\nBot will no longer react to status updates.',
                    ...getChannelInfo()
                });
            } else {
                await sock.sendMessage(chatId, { 
                    text: '❌ Invalid reaction command! Use: .autostatus react on/off',
                    ...getChannelInfo()
                });
            }
        } else if (command === 'reaction') {
            // Handle custom emoji reaction configuration
            const emoji = args[1]?.trim();
            if (!emoji) {
                await sock.sendMessage(chatId, { 
                    text: `❌ Please specify an emoji!\nCurrent reaction: ${config.reaction || '💚'}\nUse: .autostatus reaction <emoji>`,
                    ...getChannelInfo()
                });
                return;
            }

            config.reaction = emoji;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            await sock.sendMessage(chatId, { 
                text: `✅ Status reaction emoji successfully updated to ${emoji}!`,
                ...getChannelInfo()
            });
        } else {
            await sock.sendMessage(chatId, { 
                text: '❌ Invalid command! Use:\n.autostatus on/off - Enable/disable auto status view\n.autostatus react on/off - Enable/disable status reactions\n.autostatus reaction <emoji> - Change reaction emoji',
                ...getChannelInfo()
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error occurred while managing auto status!\n' + error.message,
            ...getChannelInfo()
        });
    }
}

// Function to check if auto status is enabled
function isAutoStatusEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath));
        return config.enabled;
    } catch (error) {
        console.error('Error checking auto status config:', error);
        return false;
    }
}

// Function to check if status reactions are enabled
function isStatusReactionEnabled() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath));
        return config.reactOn;
    } catch (error) {
        console.error('Error checking status reaction config:', error);
        return false;
    }
}

// Function to get the configured reaction emoji
function getStatusReaction() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath));
        return config.reaction || '💚';
    } catch (error) {
        return '💚';
    }
}

// Function to react to status using proper Baileys native method
async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) {
            return;
        }

        const reactionEmoji = getStatusReaction();
        const participantJid = statusKey.participant || statusKey.remoteJid;

        // Ensure we have a valid individual user JID, not 'status@broadcast'
        if (!participantJid || participantJid === 'status@broadcast') {
            console.log('❌ Cannot react: Missing valid participant JID for status.');
            return;
        }

        // Use Baileys native sendMessage with react and statusJidList
        await sock.sendMessage(
            'status@broadcast',
            {
                react: {
                    text: reactionEmoji,
                    key: {
                        remoteJid: 'status@broadcast',
                        id: statusKey.id,
                        participant: participantJid,
                        fromMe: false
                    }
                }
            },
            {
                statusJidList: [participantJid]
            }
        );
        
        console.log(`✅ Successfully reacted to status with ${reactionEmoji}`);
    } catch (error) {
        console.error('❌ Error reacting to status:', error.message);
    }
}

// Function to handle status updates
async function handleStatusUpdate(sock, status) {
    try {
        if (!isAutoStatusEnabled()) {
            return;
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Handle status from messages.upsert
        if (status.messages && status.messages.length > 0) {
            const msg = status.messages[0];
            if (msg.key && msg.key.remoteJid === 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);
                    await reactToStatus(sock, msg.key);
                } catch (err) {
                    if (err.message?.includes('rate-overlimit')) {
                        console.log('⚠️ Rate limit hit, waiting before retrying...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await sock.readMessages([msg.key]);
                        await reactToStatus(sock, msg.key);
                    } else {
                        throw err;
                    }
                }
                return;
            }
        }

        // Handle direct status updates
        if (status.key && status.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.key]);
                await reactToStatus(sock, status.key);
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.key]);
                    await reactToStatus(sock, status.key);
                } else {
                    throw err;
                }
            }
            return;
        }

        // Handle status in reactions
        if (status.reaction && status.reaction.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.reaction.key]);
                await reactToStatus(sock, status.reaction.key);
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.reaction.key]);
                    await reactToStatus(sock, status.reaction.key);
                } else {
                    throw err;
                }
            }
            return;
        }

    } catch (error) {
        console.error('❌ Error in auto status view:', error.message);
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate,
    isAutoStatusEnabled,
    isStatusReactionEnabled,
    reactToStatus
};