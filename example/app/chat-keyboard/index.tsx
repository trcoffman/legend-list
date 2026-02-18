import { useRef, useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardGestureArea, KeyboardProvider, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LegendListRef } from "@legendapp/list";
import { KeyboardAvoidingLegendList } from "@legendapp/list/keyboard";

type Message = {
    id: string;
    text: string;
    sender: "user" | "bot";
    timeStamp: number;
};

const MS_PER_SECOND = 1000;

let idCounter = 0;

const defaultChatMessages: Message[] = (
    [
        { sender: "user", text: "Hi, I have a question about your product" },
        { sender: "bot", text: "Hello there! How can I assist you today?" },
        { sender: "user", text: "I'm looking for information about pricing plans" },
        { sender: "bot", text: "We offer several pricing tiers based on your needs" },
        { sender: "bot", text: "Our basic plan starts at $9.99 per month" },
        { sender: "user", text: "Do you offer any discounts for annual billing?" },
        { sender: "bot", text: "Yes! You can save 20% with our annual billing option" },
        { sender: "user", text: "That sounds great. What features are included?" },
        { sender: "bot", text: "The basic plan includes all core features plus 10GB storage" },
        { sender: "bot", text: "Premium plans include priority support and additional tools" },
        { sender: "user", text: "I think the basic plan would work for my needs" },
        { sender: "bot", text: "Perfect! I can help you get set up with that" },
        { sender: "user", text: "Thanks for your help so far" },
        { sender: "bot", text: "You're welcome! Is there anything else I can assist with today?" },
    ] as const
).map((msg, index) => ({
    id: String(index),
    sender: msg.sender,
    text: msg.text,
    timeStamp: Date.now() - MS_PER_SECOND * (14 - index),
}));

// Set idCounter to continue after default messages
idCounter = defaultChatMessages.length;

function ChatMessage({ item }: { item: Message }) {
    return (
        <>
            <View
                style={[
                    styles.messageContainer,
                    item.sender === "bot" ? styles.botMessageContainer : styles.userMessageContainer,
                    item.sender === "bot" ? styles.botStyle : styles.userStyle,
                ]}
            >
                <Text style={[styles.messageText, item.sender === "user" && styles.userMessageText]}>{item.text}</Text>
            </View>
            <View style={[styles.timeStamp, item.sender === "bot" ? styles.botStyle : styles.userStyle]}>
                <Text style={styles.timeStampText}>{new Date(item.timeStamp).toLocaleTimeString()}</Text>
            </View>
        </>
    );
}

const ChatKeyboard = () => {
    const [messages, setMessages] = useState<Message[]>(defaultChatMessages);
    const [inputText, setInputText] = useState("");
    const [topItemIndex, setTopItemIndex] = useState<number | undefined>(undefined);
    const [maintainScrollAtEnd, setMaintainScrollAtEnd] = useState(true);
    const listRef = useRef<LegendListRef>(null);
    const insets = useSafeAreaInsets();

    const sendMessage = () => {
        const text = inputText || "Empty message";
        if (text.trim()) {
            // Set topItemIndex to the index of the user's message (current length before adding)
            const userMessageIndex = messages.length;
            setTopItemIndex(userMessageIndex);

            // Disable maintainScrollAtEnd so we can do an animated scroll
            setMaintainScrollAtEnd(false);

            setMessages((messagesNew) => [
                ...messagesNew,
                { id: String(idCounter++), sender: "user", text: text, timeStamp: Date.now() },
            ]);
            setInputText("");

            // Scroll to end after the message is added
            setTimeout(() => {
                listRef.current?.scrollToEnd({ animated: true });
            }, 200);

            // // Re-enable maintainScrollAtEnd after the scroll animation completes
            // setTimeout(() => {
            //     setMaintainScrollAtEnd(true);
            // }, 800);

            setTimeout(() => {
                const isLongReply = Math.random() > 0.5;
                const shortReply = `Got it! Thanks for asking about "${text}".`;
                const longReply = `Thank you for your message! I've received your inquiry about "${text}" and I'm happy to help you with this. Let me provide you with a comprehensive response that covers all the relevant details.\n\nFirst, I want to make sure I understand your question correctly. Based on what you've shared, it seems like you're looking for detailed information and guidance.\n\nHere are some key points to consider:\n\n1. We offer a wide range of solutions tailored to your specific needs and requirements.\n\n2. Our team of experts is available 24/7 to assist you with any questions or concerns you may have.\n\n3. We pride ourselves on delivering exceptional customer service and support.\n\n4. Our products and services are designed with quality and reliability in mind.\n\n5. We continuously improve our offerings based on customer feedback.\n\nI'll do my best to address all aspects of your question and provide helpful suggestions. Please let me know if you need any clarification or have follow-up questions!\n\nAdditionally, I'd like to mention that we have several resources available that might be helpful for you. Our documentation is comprehensive and covers most common use cases. We also have a community forum where you can connect with other users and share experiences.\n\nIs there anything specific you'd like me to elaborate on?`;

                setMessages((messagesNew) => [
                    ...messagesNew,
                    {
                        id: String(idCounter++),
                        sender: "bot",
                        text: isLongReply ? longReply : shortReply,
                        timeStamp: Date.now(),
                    },
                ]);
            }, 1000);
        }
    };

    return (
        <KeyboardProvider>
            <View style={[styles.container, { paddingBottom: insets.bottom, paddingTop: insets.top }]}>
                <KeyboardGestureArea interpolator="ios" offset={60} style={styles.container}>
                    <KeyboardAvoidingLegendList
                        alignItemsAtEnd
                        contentContainerStyle={styles.contentContainer}
                        data={messages}
                        estimatedItemSize={80}
                        initialScrollAtEnd
                        keyExtractor={(item, index) => index}
                        maintainVisibleContentPosition
                        ref={listRef}
                        renderItem={ChatMessage}
                        safeAreaInsetBottom={insets.bottom}
                        style={styles.list}
                        topItemIndex={topItemIndex}
                    />
                </KeyboardGestureArea>
                <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
                    <View style={styles.inputContainer}>
                        <TextInput
                            onChangeText={setInputText}
                            placeholder="Type a message"
                            style={styles.input}
                            value={inputText}
                        />
                        <Button onPress={sendMessage} title="Send" />
                    </View>
                </KeyboardStickyView>
            </View>
        </KeyboardProvider>
    );
};

const styles = StyleSheet.create({
    botMessageContainer: {
        backgroundColor: "#f1f1f1",
    },
    botStyle: {
        alignSelf: "flex-start",
        maxWidth: "75%",
    },
    container: {
        backgroundColor: "#fff",
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 16,
        // paddingTop: 96,
    },
    input: {
        borderColor: "#ccc",
        borderRadius: 5,
        borderWidth: 1,
        flex: 1,
        marginRight: 10,
        padding: 10,
    },
    inputContainer: {
        alignItems: "center",
        backgroundColor: "white",
        borderColor: "#ccc",
        borderTopWidth: 1,
        flexDirection: "row",
        padding: 10,
    },
    list: {
        flex: 1,
    },
    messageContainer: {
        borderRadius: 16,
        marginVertical: 4,
        padding: 16,
    },
    messageText: {
        fontSize: 16,
    },
    timeStamp: {
        marginVertical: 5,
    },
    timeStampText: {
        color: "#888",
        fontSize: 12,
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

export default ChatKeyboard;
