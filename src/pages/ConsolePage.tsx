
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
// Removed import of Map component
import { Quiz } from '../components/quiz/Quiz';


import './ConsolePage.scss';


/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

interface QuizQuestion {
  quizId: string; // Added quizId
  question: string;
  options: string[];
  answer?: string; // Optional if not always included
}

type QuizQuestionResponse = QuizQuestion | { error: string };

export function ConsolePage() {
  const [currentQuizQuestion, setCurrentQuizQuestion] = useState<QuizQuestion | null>(null);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizFeedback, setQuizFeedback] = useState<string>('');

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinCode, setPinCode] = useState('');

  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || '';

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  // Removed coords and marker state variables

  // New state variables for toggling sections
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder takes speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * Unified Answer Handler
   */
  const handleAnswer = useCallback(
    async (quizId: string, userAnswer: string) => {
      if (!currentQuizQuestion) return;
  
      setCanPushToTalk(false);
  
      try {
        const response = await fetch('https://quizshow.ference.ai/api/checkAnswers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_answer: userAnswer, quizId }),
        });
  
        const result = await response.json();
  
        if (result.error) {
          throw new Error(result.error);
        }
  
        if (result.isCorrect) {
          setQuizScore((prevScore) => prevScore + 1);
          setQuizFeedback('Correct!');
        } else {
          setQuizFeedback(`Incorrect. The correct answer was ${result.result}.`);
        }
  
        // Remove the setTimeout here
        setCanPushToTalk(true);
      } catch (error) {
        console.error('Error submitting quiz answer:', error);
        setQuizFeedback('There was an error processing your answer.');
        setCanPushToTalk(true);
      }
    },
    [currentQuizQuestion]
  );

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (!isAuthorized) return;
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents, isAuthorized]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    if (!isAuthorized) return; // Ensure the user is authorized before running
  
    let isLoaded = true;
  
    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;
  
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;
  
    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();
  
    return () => {
      isLoaded = false;
    };
  }, [isAuthorized]); // Add `isAuthorized` to the dependency array
  
  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events, and more
   */
  useEffect(() => {
    if (!isAuthorized) return; // Ensure the user is authorized before running
  
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;
  
    // Set instructions
    client.updateSession({
      instructions: `
        You are an AI assistant designed to facilitate quiz shows. When a new quiz question is received, always use the 'set_memory' tool to store the **entire quiz question object as a JSON string** with the key 'current_question'. Do not store just the 'quizId' or any other identifier.
    
        Present the question and options to the user without revealing the correct answer.
    
        When the user provides an answer, use the 'check_answer' tool to verify it. The tool will automatically use the current question stored in memory.
    
        After providing feedback on the answer, ask the user if they want to continue with another question. If they do, use the 'get_quiz_question' tool again to fetch a new question, and remember to store it using 'set_memory'.
    
        Always ensure that the current question is stored in memory before checking answers.
      `,
    });
    
  
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });
  
  
  }, [isAuthorized]); // Add `isAuthorized` to the dependency array

  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({
      instructions: `
        You are an AI assistant designed to facilitate quiz shows. When the user wants to start a quiz or asks for a quiz question, use the 'get_quiz_question' tool with an appropriate topic to fetch a question. Present the question and options to the user without revealing the correct answer. Await the user's response and then confirm whether it's correct.
      `,
    });

    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });
    client.updateSession({ voice: 'echo' });
    // Add tools

    // Add get_quiz_question tool
    let currentQuestion: QuizQuestion | null = null;

    client.addTool(
      {
        name: 'get_quiz_question',
        description: 'Fetches a quiz question based on a given topic.',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'The topic for the quiz question.',
            },
          },
          required: ['topic'],
        },
      },
      async ({ topic }: { topic: string }) => {
        try {
          const response = await fetch(
            `https://quizshow.ference.ai/api/getQuiz?topic=${encodeURIComponent(topic)}`
          );
          const data: QuizQuestionResponse = await response.json();

          if ('error' in data) {
            throw new Error(data.error);
          }

          currentQuestion = data as QuizQuestion;
          setCurrentQuizQuestion(currentQuestion);
          return currentQuestion;
        } catch (error) {
          console.error('Error fetching quiz question:', error);
          return { error: 'Failed to fetch quiz question.' };
        }
      }
    );

    // Update check_answer tool
    client.addTool(
      {
        name: 'check_answer',
        description: 'Checks the user\'s answer against the correct answer.',
        parameters: {
          type: 'object',
          properties: {
            user_answer: {
              type: 'string',
              description: 'The answer provided by the user.',
            },
          },
          required: ['user_answer'],
        },
      },
      async ({ user_answer }: { user_answer: string }) => {
        if (!currentQuestion) {
          console.error('No current quiz question available.');
          return { error: 'No current quiz question.' };
        }
    
        try {
          const response = await fetch('https://quizshow.ference.ai/api/checkAnswers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_answer,
              quizId: currentQuestion.quizId,
            }),
          });
          const result = await response.json();
    
          if (result.error) {
            throw new Error(result.error);
          }
    
          if (result.isCorrect) {
            setQuizScore((prevScore) => prevScore + 1);
            setQuizFeedback('Correct!');
          } else {
            setQuizFeedback(`Incorrect. The correct answer was ${result.result}.`);
          }
    
          return result;
        } catch (error) {
          console.error('Error checking answer:', error);
          return { error: 'Failed to check answer.' };
        }
      }
    );

    client.addTool(
      {
        name: 'next_question',
        description: 'Moves to the next question in the quiz.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      async () => {
        setQuizFeedback('');
        setCurrentQuizQuestion(null);
        return { message: 'Ready for the next question.' };
      }
    );

    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string.',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { key: string; value: string }) => {
        try {
          // Log value before attempting to parse
          console.log('Value before parsing:', value);
    
          if (key === 'current_question') {
            // Check if the value is a valid JSON string
            if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
              const parsedValue = JSON.parse(value) as QuizQuestion;
              console.log('Parsed current_question:', parsedValue);
              currentQuestion = parsedValue;
              setCurrentQuizQuestion(currentQuestion);
            } else {
              console.error(
                'Expected JSON for current_question, but received:',
                value
              );
              return { error: 'Expected a JSON object for current_question.' };
            }
          }
    
          // Update memoryKv state
          setMemoryKv((memoryKv) => {
            const newKv = { ...memoryKv };
            // Store the value as is
            newKv[key] = value;
            return newKv;
          });
    
          return { ok: true };
        } catch (error) {
          console.error('Error in set_memory tool:', error);
          return { error: 'Failed to set memory value.' };
        }
      }
    );
    
    
 

    // Handle realtime events from client and server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // If we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // Cleanup; resets to defaults
      client.reset();
    };
  }, []); // Changed dependency array to run only once on mount

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      {/* Content Top Section */}
      <div className="content-top">
        <div className="content-title">
          <img src="/openai-logomark.svg" alt="OpenAI Logo" />
          <span>realtime console</span>
        </div>
        <div className="content-api-key">
          {!isAuthorized ? (
            <div className="pin-code-prompt">
              <input
                type="password"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="Enter PIN code"
              />
              <Button
                label="Submit"
                onClick={() => {
                  if (pinCode === '7777') {
                    setIsAuthorized(true);
                  } else {
                    alert('Incorrect PIN code');
                    setPinCode('');
                  }
                }}
              />
            </div>
          ) : (
            // Optionally display some info or leave it empty
            <div className="api-key-info">
              {/* You can display a welcome message or the masked API key */}
              <span>Welcome!</span>
            </div>
          )}
        </div>
      </div>
      {/* Main Content */}
      {isAuthorized ? (
        <div className="content-main">
          <div className="content-logs">
            <div className="visualization">
              <div className="visualization-entry client">
                <canvas ref={clientCanvasRef} />
              </div>
              <div className="visualization-entry server">
                <canvas ref={serverCanvasRef} />
              </div>
            </div>

            {/* Quiz Element Moved Above Events */}
            {currentQuizQuestion && (
              <div className="content-block quiz">
                <div className="content-block-title">Quiz Show</div>
                <div className="content-block-body">
                  <Quiz
                    question={currentQuizQuestion?.question}
                    options={currentQuizQuestion?.options || []}
                    quizId={currentQuizQuestion?.quizId || ''}
                    score={quizScore}
                    onSubmitAnswer={handleAnswer}
                    feedback={quizFeedback}
                  />
                </div>
              </div>
            )}

            {/* Events Section with Toggle */}
            <div className="content-block events">
              <div
                className="content-block-title"
                onClick={() => setIsEventsExpanded(!isEventsExpanded)}
              >
                events {isEventsExpanded ? <ArrowUp /> : <ArrowDown />}
              </div>
              {isEventsExpanded && (
                <div className="content-block-body" ref={eventsScrollRef}>
                  {!realtimeEvents.length && `awaiting connection...`}
                  {realtimeEvents.map((realtimeEvent, i) => {
                    const count = realtimeEvent.count;
                    const event = { ...realtimeEvent.event };
                    if (event.type === 'input_audio_buffer.append') {
                      event.audio = `[trimmed: ${event.audio.length} bytes]`;
                    } else if (event.type === 'response.audio.delta') {
                      event.delta = `[trimmed: ${event.delta.length} bytes]`;
                    }
                    return (
                      <div className="event" key={event.event_id}>
                        <div className="event-timestamp">
                          {formatTime(realtimeEvent.time)}
                        </div>
                        <div className="event-details">
                          <div
                            className="event-summary"
                            onClick={() => {
                              // Toggle event details
                              const id = event.event_id;
                              const expanded = { ...expandedEvents };
                              if (expanded[id]) {
                                delete expanded[id];
                              } else {
                                expanded[id] = true;
                              }
                              setExpandedEvents(expanded);
                            }}
                          >
                            <div
                              className={`event-source ${
                                event.type === 'error'
                                  ? 'error'
                                  : realtimeEvent.source
                              }`}
                            >
                              {realtimeEvent.source === 'client' ? (
                                <ArrowUp />
                              ) : (
                                <ArrowDown />
                              )}
                              <span>
                                {event.type === 'error'
                                  ? 'error!'
                                  : realtimeEvent.source}
                              </span>
                            </div>
                            <div className="event-type">
                              {event.type}
                              {count && ` (${count})`}
                            </div>
                          </div>
                          {!!expandedEvents[event.event_id] && (
                            <div className="event-payload">
                              {JSON.stringify(event, null, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Conversation Section with Toggle */}
            <div className="content-block conversation">
              <div
                className="content-block-title"
                onClick={() => setIsConversationExpanded(!isConversationExpanded)}
              >
                conversation {isConversationExpanded ? <ArrowUp /> : <ArrowDown />}
              </div>
              {isConversationExpanded && (
                <div className="content-block-body" data-conversation-content>
                  {!items.length && `awaiting connection...`}
                  {items.map((conversationItem, i) => {
                    return (
                      <div className="conversation-item" key={conversationItem.id}>
                        <div className={`speaker ${conversationItem.role || ''}`}>
                          <div>
                            {(
                              conversationItem.role || conversationItem.type
                            ).replaceAll('_', ' ')}
                          </div>
                          <div
                            className="close"
                            onClick={() =>
                              deleteConversationItem(conversationItem.id)
                            }
                          >
                            <X />
                          </div>
                        </div>
                        <div className={`speaker-content`}>
                          {/* Tool response */}
                          {conversationItem.type === 'function_call_output' && (
                            <div>{conversationItem.formatted.output}</div>
                          )}
                          {/* Tool call */}
                          {!!conversationItem.formatted.tool && (
                            <div>
                              {conversationItem.formatted.tool.name}(
                              {conversationItem.formatted.tool.arguments})
                            </div>
                          )}
                          {!conversationItem.formatted.tool &&
                            conversationItem.role === 'user' && (
                              <div>
                                {conversationItem.formatted.transcript ||
                                  (conversationItem.formatted.audio?.length
                                    ? '(awaiting transcript)'
                                    : conversationItem.formatted.text ||
                                      '(item sent)')}
                              </div>
                            )}
                          {!conversationItem.formatted.tool &&
                            conversationItem.role === 'assistant' && (
                              <div>
                                {conversationItem.formatted.transcript ||
                                  conversationItem.formatted.text ||
                                  '(truncated)'}
                              </div>
                            )}
                          {conversationItem.formatted.file && (
                            <audio
                              src={conversationItem.formatted.file.url}
                              controls
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="content-actions">
              <Toggle
                defaultValue={false}
                labels={['manual', 'vad']}
                values={['none', 'server_vad']}
                onChange={(_, value) => changeTurnEndType(value)}
              />
              <div className="spacer" />
              {isConnected && canPushToTalk && (
                <Button
                  label={isRecording ? 'release to send' : 'push to talk'}
                  buttonStyle={isRecording ? 'alert' : 'regular'}
                  disabled={!isConnected || !canPushToTalk}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                />
              )}
              <div className="spacer" />
              <Button
                label={isConnected ? 'disconnect' : 'connect'}
                iconPosition={isConnected ? 'end' : 'start'}
                icon={isConnected ? X : Zap}
                buttonStyle={isConnected ? 'regular' : 'action'}
                onClick={
                  isConnected ? disconnectConversation : connectConversation
                }
              />
            </div>
          </div>
          {/* Removed the content-right div */}
        </div>
      ) : (
        <div className="content-locked">
          {/* Optionally, display a message or image */}
        </div>
      )}
    </div>
  );
}