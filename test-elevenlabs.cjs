/**
 * ElevenLabs Conversational AI Connection Test
 * 
 * This script tests the WebSocket connection to your ElevenLabs agent
 * and shows you exactly what messages ElevenLabs sends back.
 * 
 * Usage: node test-elevenlabs.js
 */

const WebSocket = require('ws');

// Your agent ID
const AGENT_ID = 'agent_4801k12yckhqe6htd8vkwcv65qx3';

// ElevenLabs WebSocket URL
const WS_URL = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`;

console.log('='.repeat(80));
console.log('🧪 ElevenLabs Conversational AI Test');
console.log('='.repeat(80));
console.log(`Agent ID: ${AGENT_ID}`);
console.log(`WebSocket URL: ${WS_URL}`);
console.log('='.repeat(80));
console.log('');

// Track what we receive
let messagesReceived = 0;
let conversationStarted = false;
let audioChunksReceived = 0;
let transcriptsReceived = 0;
let responsesReceived = 0;

// Create WebSocket connection
console.log('📡 Connecting to ElevenLabs...');
const ws = new WebSocket(WS_URL);

// Connection opened
ws.on('open', () => {
  console.log('✅ WebSocket connection ESTABLISHED');
  console.log('⏳ Waiting for messages from ElevenLabs...');
  console.log('   (Agent should send "conversation_initiation_metadata" if configured correctly)');
  console.log('');
  
  // Optional: Send a test audio chunk after 2 seconds
  setTimeout(() => {
    console.log('📤 Sending test audio chunk...');
    
    // Create a small silent audio chunk (1 second of silence at 16kHz mono PCM)
    const silentAudio = Buffer.alloc(16000 * 2); // 16kHz * 2 bytes per sample
    const base64Audio = silentAudio.toString('base64');
    
    const message = JSON.stringify({
      type: 'user_audio_chunk',
      audio_chunk: base64Audio,
    });
    
    ws.send(message);
    console.log(`✓ Sent ${base64Audio.length} base64 characters`);
    console.log('⏳ Waiting for AI response...');
    console.log('');
  }, 2000);
  
  // Auto-close after 15 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout (15 seconds) - closing connection');
    ws.close();
  }, 15000);
});

// Message received
ws.on('message', (data) => {
  messagesReceived++;
  
  try {
    const message = JSON.parse(data.toString());
    
    console.log('─'.repeat(80));
    console.log(`📨 MESSAGE #${messagesReceived} FROM ELEVENLABS:`);
    console.log('─'.repeat(80));
    console.log('Type:', message.type);
    console.log('Full message:', JSON.stringify(message, null, 2));
    console.log('');
    
    // Track specific message types
    switch (message.type) {
      case 'conversation_initiation_metadata':
        conversationStarted = true;
        console.log('🎉 Conversation initiated successfully!');
        break;
        
      case 'audio':
        audioChunksReceived++;
        console.log(`🔊 AI AUDIO CHUNK RECEIVED! (${message.audio?.chunk?.length || 0} base64 chars)`);
        break;
        
      case 'user_transcript':
        transcriptsReceived++;
        console.log(`📝 User transcript: "${message.user_transcription_event?.user_transcript}"`);
        break;
        
      case 'agent_response':
        responsesReceived++;
        console.log(`💬 AI response: "${message.agent_response_event?.agent_response}"`);
        break;
        
      case 'interruption':
        console.log('⚠️ Interruption detected');
        break;
        
      case 'pong':
        console.log('🏓 Pong received');
        break;
        
      default:
        console.log('❓ Unknown message type');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
    console.error('Raw data:', data.toString());
  }
});

// Error occurred
ws.on('error', (error) => {
  console.error('❌ WebSocket ERROR:');
  console.error(error);
  console.log('');
});

// Connection closed
ws.on('close', (code, reason) => {
  console.log('='.repeat(80));
  console.log('🔌 WebSocket connection CLOSED');
  console.log(`Code: ${code}`);
  console.log(`Reason: ${reason || 'No reason provided'}`);
  console.log('='.repeat(80));
  console.log('');
  
  // Summary
  console.log('📊 TEST RESULTS:');
  console.log('─'.repeat(80));
  console.log(`Total messages received: ${messagesReceived}`);
  console.log(`Conversation started: ${conversationStarted ? '✅ YES' : '❌ NO'}`);
  console.log(`Audio chunks received: ${audioChunksReceived}`);
  console.log(`Transcripts received: ${transcriptsReceived}`);
  console.log(`AI responses received: ${responsesReceived}`);
  console.log('─'.repeat(80));
  console.log('');
  
  // Diagnosis
  console.log('🔍 DIAGNOSIS:');
  console.log('─'.repeat(80));
  
  if (messagesReceived === 0) {
    console.log('❌ PROBLEM: No messages received from ElevenLabs');
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Agent ID is incorrect or agent does not exist');
    console.log('  2. Agent is not published/active in ElevenLabs dashboard');
    console.log('  3. Network/firewall blocking WebSocket connection');
    console.log('  4. ElevenLabs API is down (check status.elevenlabs.io)');
    console.log('');
    console.log('Next steps:');
    console.log('  → Verify agent exists in ElevenLabs dashboard');
    console.log('  → Check if agent is published and active');
    console.log('  → Try a different agent ID to test');
  } else if (!conversationStarted) {
    console.log('⚠️ WARNING: Connection works but conversation not initiated');
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Agent missing "first message" configuration');
    console.log('  2. Agent not properly configured for voice conversations');
    console.log('');
    console.log('Next steps:');
    console.log('  → Check agent settings in ElevenLabs dashboard');
    console.log('  → Ensure agent has a first message configured');
  } else if (audioChunksReceived === 0) {
    console.log('⚠️ WARNING: Conversation started but no AI audio received');
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Agent received audio but is not responding');
    console.log('  2. Agent waiting for user to speak first');
    console.log('  3. Audio was too short/silent to trigger response');
    console.log('');
    console.log('Next steps:');
    console.log('  → Try sending actual speech audio instead of silence');
    console.log('  → Check agent\'s conversation settings');
  } else {
    console.log('✅ SUCCESS: Agent is responding properly!');
    console.log('');
    console.log('The ElevenLabs agent is working correctly.');
    console.log('If you still can\'t hear AI in your app, the issue is likely:');
    console.log('  1. Audio playback configuration (ffplay/Line 2 setup)');
    console.log('  2. Audio device routing in Windows');
    console.log('  3. Volume/mute settings');
  }
  
  console.log('─'.repeat(80));
});
