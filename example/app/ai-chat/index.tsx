import { BlurView } from "expo-blur";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Keyboard, type LayoutChangeEvent, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardGestureArea, KeyboardProvider, KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LegendListRef } from "@legendapp/list";
import { KeyboardAvoidingLegendList } from "@legendapp/list/keyboard";

type Message = {
    id: string;
    text: string;
    sender: "user" | "system";
    timeStamp: number;
    isPlaceholder?: boolean;
    isNew?: boolean;
};

let idCounter = 0;

const AIChat = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState("");
    const [inputHeight, setInputHeight] = useState(0);
    const [topItemIndex, setTopItemIndex] = useState<number | undefined>(undefined);
    const listRef = useRef<LegendListRef>(null);
    const inputRef = useRef<TextInput>(null);
    const insets = useSafeAreaInsets();

    const handleInputLayout = (event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout;
        setInputHeight(height);
    };

    const contentContainerStyle = useMemo(() => styles.contentContainer, [inputHeight]);

    const inputContainerStyle = useMemo(
        () => [styles.inputContainer, { paddingBottom: insets.bottom + 10 }],
        [inputHeight, insets.bottom],
    );

    const doSendMessage = (text: string) => {
        // Set topItemIndex to the user's message index
        setTopItemIndex(messages.length);

        setMessages((prevMessages) => [
            ...prevMessages,
            {
                id: String(idCounter++),
                isNew: true,
                sender: "user",
                text: text,
                timeStamp: Date.now(),
            },
        ]);

        // Scroll to end after the message is added
        setTimeout(() => {
            console.log("Scrolling to end after sending message");
            listRef.current?.scrollToEnd({ animated: true });
        }, 400);

        // Simulate AI response
        setTimeout(() => {
            simulateAIResponse(text);
        }, 800);
    };

    const sendMessage = () => {
        const text = inputText.trim();
        if (!text) return;

        // Clear input immediately for better UX
        setInputText("");

        // Check if input is focused (keyboard is likely showing)
        const isFocused = inputRef.current?.isFocused();

        if (isFocused) {
            // Blur and wait for keyboard to hide before sending
            inputRef.current?.blur();

            const subscription = Keyboard.addListener("keyboardDidHide", () => {
                subscription.remove();
                doSendMessage(text);
            });
        } else {
            // Keyboard already hidden, send immediately
            doSendMessage(text);
        }
    };

    const simulateAIResponse = (userMessage: string) => {
        // Generate a unique ID for this AI response
        const aiMessageId = String(idCounter++);

        // Add placeholder
        setMessages((prevMessages) => [
            ...prevMessages,
            {
                id: aiMessageId,
                isPlaceholder: true,
                sender: "system",
                text: "",
                timeStamp: Date.now(),
            },
        ]);

        // Simulate AI thinking time
        setTimeout(() => {
            const replies = [
                // Short reply
                `Got it! "${userMessage}" - let me know if you need more help.`,
                // Medium reply
                `I understand you said: "${userMessage}". That's a great point! Here are a few thoughts:\n\n1. First consideration\n2. Second aspect\n\nAnything else?`,
                // Long reply
                `I understand you said: "${userMessage}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know?`,
                // Super long
                `I understand you said: "${userMessage}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know? I understand you said: "${userMessage}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know? I understand you said: "${userMessage}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know?`,
            ];
            const responseText = replies[Math.floor(Math.random() * replies.length)];
            // const responseText = replies[2];
            const words = responseText.split(" ");
            let currentWordIndex = 0;

            // Replace placeholder with empty system message (keep same ID)
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === aiMessageId
                        ? {
                              ...msg,
                              isPlaceholder: false,
                              text: "",
                          }
                        : msg,
                ),
            );

            // Stream words - only update the message with matching ID
            const streamInterval = setInterval(() => {
                if (currentWordIndex < words.length) {
                    const currentText = words.slice(0, currentWordIndex + 1).join(" ");
                    setMessages((prevMessages) =>
                        prevMessages.map((msg) => (msg.id === aiMessageId ? { ...msg, text: currentText } : msg)),
                    );
                    currentWordIndex++;
                } else {
                    clearInterval(streamInterval);
                }
            }, 30);
        }, 5000);
    };

    useEffect(() => {
        // Generate IDs for initial messages
        const initialAiMessageId = String(idCounter++);

        // After 1 second, add user message and system placeholder
        const timer1 = setTimeout(() => {
            setMessages([
                {
                    id: String(idCounter++),
                    sender: "user",
                    text: "Hey, can you help me understand how React Native virtualization works?",
                    timeStamp: Date.now(),
                },
                {
                    id: initialAiMessageId,
                    isPlaceholder: true,
                    sender: "system",
                    text: "",
                    timeStamp: Date.now(),
                },
            ]);
        }, 500);

        // After 3 seconds total (2 seconds after the first), start streaming the message
        const fullText = `React Native virtualization is a performance optimization technique that's crucial for handling large lists efficiently. Here's how it works:

1. **Rendering Only Visible Items**: Instead of rendering all items in a list at once, virtualization only renders the items that are currently visible on screen, plus a small buffer of items just outside the visible area.

2. **Dynamic Item Creation/Destruction**: As you scroll, items that move out of view are removed from the DOM/native view hierarchy, and new items that come into view are created. This keeps memory usage constant regardless of list size.

3. **View Recycling**: Advanced virtualization systems reuse view components rather than creating new ones, which reduces garbage collection and improves performance.

4. **Estimated vs Actual Sizing**: The system uses estimated item sizes to calculate scroll positions and total content size, then adjusts as actual sizes are measured.

5. **Legend List Implementation**: Legend List enhances this by providing better handling of dynamic item sizes, bidirectional scrolling, and maintains scroll position more accurately than FlatList.

The key benefits are:
- Constant memory usage regardless of data size
- Smooth scrolling performance
- Better handling of dynamic content
- Reduced time to interactive

This makes it possible to scroll through thousands of items without performance degradation, which is essential for modern mobile apps dealing with large datasets like social media feeds, chat histories, or product catalogs.`;

        const words = fullText.split(" ");
        let currentWordIndex = 0;

        const timer2 = setTimeout(() => {
            // Replace placeholder with empty system message (keep same ID)
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === initialAiMessageId
                        ? {
                              ...msg,
                              isPlaceholder: false,
                              text: "",
                          }
                        : msg,
                ),
            );

            // Start streaming words - only update the message with matching ID
            const streamInterval = setInterval(() => {
                if (currentWordIndex < words.length) {
                    const currentText = words.slice(0, currentWordIndex + 1).join(" ");
                    setMessages((prevMessages) =>
                        prevMessages.map((msg) =>
                            msg.id === initialAiMessageId ? { ...msg, text: currentText } : msg,
                        ),
                    );
                    currentWordIndex++;
                } else {
                    clearInterval(streamInterval);
                }
            }, 1);
        }, 1500);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, []);

    return (
        <KeyboardProvider>
            <View style={[styles.container, { paddingBottom: 0, paddingTop: insets.top }]}>
                <KeyboardGestureArea interpolator="ios" offset={60} style={styles.container}>
                    {inputHeight !== 0 && (
                        <KeyboardAvoidingLegendList
                            avoidKeyboard
                            contentContainerStyle={contentContainerStyle}
                            data={messages}
                            initialScrollAtEnd
                            keyExtractor={(_item, index) => `item-${index}`}
                            maintainScrollAtEnd={Platform.OS === "web"}
                            maintainVisibleContentPosition
                            ref={listRef}
                            renderItem={({ item }) => (
                                <View>
                                    {item.isPlaceholder ? (
                                        <View
                                            style={[
                                                styles.messageContainer,
                                                styles.systemMessageContainer,
                                                styles.systemStyle,
                                            ]}
                                        >
                                            <View style={[styles.placeholderContainer, styles.messageContainer]}>
                                                <View style={styles.typingIndicator}>
                                                    <View style={[styles.dot, styles.dot1]} />
                                                    <View style={[styles.dot, styles.dot2]} />
                                                    <View style={[styles.dot, styles.dot3]} />
                                                </View>
                                                <Text style={styles.placeholderText}>AI is thinking...</Text>
                                            </View>
                                        </View>
                                    ) : item.sender === "user" ? (
                                        <Animated.View
                                            entering={item.isNew ? FadeIn.duration(1000).delay(300) : undefined}
                                            style={[
                                                styles.messageContainer,
                                                styles.userMessageContainer,
                                                styles.userStyle,
                                            ]}
                                        >
                                            <Text style={[styles.messageText, styles.userMessageText]}>
                                                {item.text}
                                            </Text>
                                            <View style={[styles.timeStamp, styles.userStyle]}>
                                                <Text style={styles.timeStampText}>
                                                    {new Date(item.timeStamp).toLocaleTimeString()}
                                                </Text>
                                            </View>
                                        </Animated.View>
                                    ) : (
                                        <View
                                            style={[
                                                styles.messageContainer,
                                                styles.systemMessageContainer,
                                                styles.systemStyle,
                                            ]}
                                        >
                                            <Text style={styles.messageText}>{item.text}</Text>
                                            <View style={[styles.timeStamp, styles.systemStyle]}>
                                                <Text style={styles.timeStampText}>
                                                    {new Date(item.timeStamp).toLocaleTimeString()}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}
                            safeAreaInsetBottom={insets.bottom}
                            style={styles.list}
                            topItemIndex={topItemIndex}
                        />
                    )}
                </KeyboardGestureArea>
                <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
                    <BlurView
                        experimentalBlurMethod="dimezisBlurView"
                        onLayout={handleInputLayout}
                        style={inputContainerStyle}
                    >
                        <TextInput
                            multiline
                            onChangeText={setInputText}
                            placeholder="Type a message"
                            ref={inputRef}
                            style={styles.input}
                            value={inputText}
                        />
                        <Button onPress={sendMessage} title="Send" />
                    </BlurView>
                </KeyboardStickyView>
            </View>
        </KeyboardProvider>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#fff",
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 16,
        // paddingBottom is set dynamically based on input height
    },
    dot: {
        backgroundColor: "#007AFF",
        borderRadius: 4,
        height: 8,
        marginHorizontal: 2,
        width: 8,
    },
    dot1: {
        animationDelay: "0s",
        animationDuration: "1.4s",
        animationIterationCount: "infinite",
        animationName: "typing",
    },
    dot2: {
        animationDelay: "0.2s",
        animationDuration: "1.4s",
        animationIterationCount: "infinite",
        animationName: "typing",
    },
    dot3: {
        animationDelay: "0.4s",
        animationDuration: "1.4s",
        animationIterationCount: "infinite",
        animationName: "typing",
    },
    input: {
        backgroundColor: "white",
        borderColor: "#ccc",
        borderRadius: 5,
        borderWidth: 1,
        flex: 1,
        marginRight: 10,
        padding: 10,
    },
    inputContainer: {
        alignItems: "center",
        backgroundColor: "transparent",
        borderColor: "#ccc",
        borderTopWidth: 1,
        flexDirection: "row",
        padding: 10,
        // marginTop is set dynamically based on input height
    },
    list: {
        flex: 1,
        overflow: "visible",
    },
    messageContainer: {
        borderRadius: 16,
        padding: 16,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    placeholderContainer: {
        backgroundColor: "#f8f9fa",
        borderColor: "#e9ecef",
        borderWidth: 1,
    },
    placeholderText: {
        color: "#666",
        fontSize: 14,
        fontStyle: "italic",
    },
    systemMessageContainer: {
        minHeight: 180,
    },
    systemStyle: {
        alignSelf: "flex-start",
        maxWidth: "85%",
    },
    timeStamp: {},
    timeStampText: {
        color: "#888",
        fontSize: 12,
    },
    typingIndicator: {
        alignItems: "center",
        flexDirection: "row",
    },
    userMessageContainer: {
        backgroundColor: "#007AFF",
    },
    userMessageText: {
        color: "white",
    },
    userStyle: {
        alignItems: "flex-end",
        alignSelf: "flex-end",
        maxWidth: "75%",
    },
});

export default AIChat;
