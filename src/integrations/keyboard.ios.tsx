// biome-ignore lint/correctness/noUnusedImports: Leaving this out makes it crash in some environments
import * as React from "react";
import { type ForwardedRef, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Insets, type ScrollViewProps } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import type Animated from "react-native-reanimated";
import type { ScrollEvent as ReanimatedScrollEvent, ScrollHandlerProcessed } from "react-native-reanimated";
import {
    isWorkletFunction,
    runOnJS,
    useAnimatedProps,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useComposedEventHandler,
    useSharedValue,
} from "react-native-reanimated";

import type { LegendListMetrics, LegendListRef, TypedForwardRef } from "@legendapp/list/react-native";
import { AnimatedLegendList, type AnimatedLegendListProps } from "@legendapp/list/reanimated";
import { useCombinedRef } from "@/hooks/useCombinedRef";

type KeyboardOnScrollCallback = (event: ReanimatedScrollEvent) => void;
type KeyboardOnScrollHandler = KeyboardOnScrollCallback | ScrollHandlerProcessed<Record<string, unknown>>;
type KeyboardAnimationMode = "idle" | "running";

type KeyboardControllerLegendListProps<ItemT> = Omit<
    AnimatedLegendListProps<ItemT>,
    "onScroll" | "contentInset" | "automaticallyAdjustContentInsets" | "onItemSizeChanged"
> & {
    onScroll?: KeyboardOnScrollHandler;
    contentInset?: Insets | undefined;
    safeAreaInsetBottom?: number;
    avoidKeyboard?: boolean;
    topItemIndex?: number;
    onItemSizeChanged?: AnimatedLegendListProps<ItemT>["onItemSizeChanged"];
    onKeyboardTransitionEnd?: (isOpen: boolean) => void;
};

const clampProgress = (progress: number) => {
    "worklet";
    // Clamp progress to 0..1 range. iOS can report progress > 1 on first keyboard open
    // when the keyboard height changes during animation (e.g., autocomplete bar appearing).
    return Math.min(1, Math.max(0, progress));
};

const calculateKeyboardInset = (height: number, safeAreaInsetBottom: number) => {
    "worklet";
    // Subtract safe area from keyboard height since iOS reports keyboard height including safe area.
    // Never return negative values.
    return Math.max(0, height - safeAreaInsetBottom);
};

const calculateEffectiveKeyboardHeight = (
    keyboardHeight: number,
    contentLength: number,
    scrollLength: number,
    avoidKeyboard: boolean | undefined,
) => {
    "worklet";
    if (avoidKeyboard) {
        return keyboardHeight;
    } else {
        const availableSpace = Math.max(0, scrollLength - contentLength);
        return Math.max(0, keyboardHeight - availableSpace);
    }
};

const calculateKeyboardTargetOffset = (
    startOffset: number,
    keyboardHeight: number,
    isOpening: boolean,
    progress: number,
) => {
    "worklet";
    // Normalized progress so 0..1 always means "how far through the keyboard transition we are".
    const normalizedProgress = isOpening ? progress : 1 - progress;
    const delta = (isOpening ? keyboardHeight : -keyboardHeight) * normalizedProgress;
    return Math.max(0, startOffset + delta);
};

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
export const KeyboardAvoidingLegendList = (forwardRef as TypedForwardRef)(function KeyboardAvoidingLegendList<ItemT>(
    props: KeyboardControllerLegendListProps<ItemT>,
    forwardedRef: ForwardedRef<LegendListRef>,
) {
    const {
        contentContainerStyle: contentContainerStyleProp,
        contentInset: contentInsetProp,
        horizontal,
        onItemSizeChanged: onItemSizeChangedProp,
        onMetricsChange: onMetricsChangeProp,
        onScroll: onScrollProp,
        safeAreaInsetBottom = 0,
        style: styleProp,
        ...rest
    } = props;

    const { alignItemsAtEnd, avoidKeyboard: avoidKeyboardProp, onKeyboardTransitionEnd, topItemIndex } = props;
    const avoidKeyboard = !!(avoidKeyboardProp || alignItemsAtEnd);

    const refLegendList = useRef<LegendListRef | null>(null);
    const combinedRef = useCombinedRef(forwardedRef, refLegendList);

    // Shared values are consumed from keyboard worklets and animated props/styles.
    const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
    // Current logical scroll position for the list.
    const scrollOffsetY = useSharedValue(0);
    // When set, drives `contentOffset` to animate the list with keyboard transitions.
    const animatedOffsetY = useSharedValue<number | null>(null);
    // Scroll position snapshot from the instant the keyboard animation starts.
    const scrollOffsetAtKeyboardStart = useSharedValue(0);
    const animationMode = useSharedValue<KeyboardAnimationMode>("idle");
    const keyboardInset = useSharedValue(0);
    // Last keyboard height converted to "list space" (safe area removed).
    const keyboardHeight = useSharedValue(0);
    const contentLength = useSharedValue(0);
    const scrollLength = useSharedValue(0);
    const isOpening = useSharedValue(false);
    const didInteractive = useSharedValue(false);
    const shouldUpdateAlignItemsAtEndMinSize = useSharedValue(false);
    // Track keyboard open state to ignore spurious iOS keyboard events
    const isKeyboardOpen = useSharedValue(false);
    const keyboardInsetRef = useRef(0);
    const topItemInset = useSharedValue(0);
    const [alignItemsAtEndMinSize, setAlignItemsAtEndMinSize] = useState<number | undefined>(undefined);
    const onScrollValue = onScrollProp as unknown;
    const onScrollCallback =
        typeof onScrollValue === "function" ? (onScrollValue as KeyboardOnScrollCallback) : undefined;
    const onScrollProcessed =
        onScrollValue && typeof onScrollValue === "object" && "workletEventHandler" in onScrollValue
            ? (onScrollValue as ScrollHandlerProcessed<Record<string, unknown>>)
            : null;
    const onScrollCallbackIsWorklet = useMemo(
        () => (onScrollCallback ? isWorkletFunction(onScrollCallback) : false),
        [onScrollCallback],
    );

    // Keep internal offset tracking and still honor user-provided onScroll callbacks/handlers.
    const scrollHandler = useAnimatedScrollHandler(
        (event) => {
            if (animationMode.get() !== "running" || didInteractive.get()) {
                scrollOffsetY.set(event.contentOffset[horizontal ? "x" : "y"]);
            }
            if (onScrollCallback) {
                if (onScrollCallbackIsWorklet) {
                    onScrollCallback(event);
                } else {
                    runOnJS(onScrollCallback)(event);
                }
            }
        },
        [horizontal, onScrollCallback, onScrollCallbackIsWorklet],
    );
    const composedScrollHandler = useComposedEventHandler([
        scrollHandler as ScrollHandlerProcessed<Record<string, unknown>>,
        onScrollProcessed as ScrollHandlerProcessed<Record<string, unknown>> | null,
    ]);
    const finalScrollHandler = onScrollProcessed ? composedScrollHandler : scrollHandler;

    const setScrollProcessingEnabled = useCallback(
        (enabled: boolean) => refLegendList.current?.setScrollProcessingEnabled(enabled),
        [refLegendList],
    );

    const reportContentInset = useCallback(
        (bottom: number) => refLegendList.current?.reportContentInset({ bottom }),
        [refLegendList],
    );

    const clearAlignItemsAtEndMinSize = useCallback(() => {
        setAlignItemsAtEndMinSize((prev) => (prev === undefined ? prev : undefined));
    }, []);

    // This min size keeps end-aligned lists stable while keyboard height changes.
    const updateAlignItemsAtEndMinSize = useCallback(
        (nextKeyboardInset?: number) => {
            if (nextKeyboardInset !== undefined) {
                keyboardInsetRef.current = nextKeyboardInset;
            }

            if (!avoidKeyboard || horizontal) {
                clearAlignItemsAtEndMinSize();
                return;
            }

            const state = refLegendList.current?.getState();
            if (!state) {
                return;
            }

            const currentInset = keyboardInsetRef.current;
            if (currentInset <= 0) {
                clearAlignItemsAtEndMinSize();
                return;
            }
            if (state.scrollLength <= 0) {
                return;
            }

            const nextMinSize = Math.max(0, state.scrollLength - currentInset);
            setAlignItemsAtEndMinSize((prev) => (prev === nextMinSize ? prev : nextMinSize));
        },
        [avoidKeyboard, clearAlignItemsAtEndMinSize, horizontal],
    );

    const calculateTopItemInset = useCallback(() => {
        if (topItemIndex === undefined || topItemIndex < 0) {
            if (topItemInset.get() !== 0) {
                topItemInset.set(0);
            }
            return;
        }

        const state = refLegendList.current?.getState();
        if (!state || topItemIndex >= state.data.length || state.scrollLength <= 0) {
            return;
        }

        // Sum sizes from topItemIndex to end
        let contentBelowTopItem = 0;
        for (let i = topItemIndex; i < state.data.length; i++) {
            const size = state.sizeAtIndex(i);
            if (size != null && size > 0) {
                contentBelowTopItem += size;
            }
        }

        const calculatedInset = Math.max(0, state.scrollLength - contentBelowTopItem);
        const currentInset = topItemInset.get();

        if (currentInset !== calculatedInset) {
            topItemInset.set(calculatedInset);
            const vKeyboardInset = keyboardInset.get();
            // max, not sum: topItemInset is calculated against full scrollLength,
            // so it already encompasses keyboard space
            reportContentInset(Math.max(vKeyboardInset, calculatedInset));
        }
    }, [topItemIndex, reportContentInset]);

    const updateScrollMetrics = useCallback(() => {
        // Metrics are captured in shared values because worklets cannot call getState().
        const state = refLegendList.current?.getState();
        if (!state) {
            return;
        }
        contentLength.set(state.contentLength);
        scrollLength.set(state.scrollLength);
        updateAlignItemsAtEndMinSize();
    }, [contentLength, scrollLength, updateAlignItemsAtEndMinSize]);

    const handleMetricsChange = useCallback(
        (metrics: LegendListMetrics) => {
            updateScrollMetrics();
            if (topItemIndex !== undefined) {
                calculateTopItemInset();
            }
            onMetricsChangeProp?.(metrics);
        },
        [onMetricsChangeProp, updateScrollMetrics, topItemIndex, calculateTopItemInset],
    );

    const handleItemSizeChange = useCallback(
        (info: { size: number; previous: number; index: number; itemKey: string; itemData: ItemT }) => {
            if (topItemIndex !== undefined && info.index >= topItemIndex) {
                calculateTopItemInset();
            }
            onItemSizeChangedProp?.(info);
        },
        [topItemIndex, calculateTopItemInset, onItemSizeChangedProp],
    );

    useEffect(() => {
        updateAlignItemsAtEndMinSize();
    }, [updateAlignItemsAtEndMinSize]);

    // Recalculate topItemInset when topItemIndex changes
    useEffect(() => {
        calculateTopItemInset();
    }, [topItemIndex, calculateTopItemInset]);

    const getEffectiveKeyboardHeightFromInset = useCallback(
        (nextKeyboardInset: number) => {
            "worklet";
            return calculateEffectiveKeyboardHeight(
                nextKeyboardInset,
                contentLength.get(),
                scrollLength.get(),
                avoidKeyboard,
            );
        },
        [avoidKeyboard, contentLength, scrollLength],
    );

    const getEffectiveKeyboardHeightFromEvent = useCallback(
        (eventHeight: number) => {
            "worklet";
            const nextKeyboardInset = calculateKeyboardInset(eventHeight, safeAreaInsetBottom);
            return getEffectiveKeyboardHeightFromInset(nextKeyboardInset);
        },
        [getEffectiveKeyboardHeightFromInset, safeAreaInsetBottom],
    );

    // Keyboard flow:
    // - onStart: initialize values for an upcoming transition.
    // - onInteractive: mark that user is driving the keyboard interactively.
    // - onMove: update in-flight offsets/insets while keyboard animates.
    // - onEnd: finalize values and hand scroll control back to the list.
    useKeyboardHandler(
        // biome-ignore assist/source/useSortedKeys: prefer start/move/end
        {
            onStart: (event) => {
                "worklet";

                // Transition starts: capture initial values used by non-interactive animations.
                animationMode.set("running");

                const progress = clampProgress(event.progress);

                // Ignore spurious events when keyboard is already open
                if (isKeyboardOpen.get() && progress >= 1 && event.height > 0) {
                    return;
                }

                if (!didInteractive.get()) {
                    if (event.height > 0) {
                        keyboardHeight.set(calculateKeyboardInset(event.height, safeAreaInsetBottom));
                    }

                    const vIsOpening = progress > 0;

                    isOpening.set(vIsOpening);
                    shouldUpdateAlignItemsAtEndMinSize.set(
                        !!avoidKeyboard && !horizontal && contentLength.get() < scrollLength.get(),
                    );

                    if (!shouldUpdateAlignItemsAtEndMinSize.get()) {
                        runOnJS(clearAlignItemsAtEndMinSize)();
                    }

                    const vScrollOffset = scrollOffsetY.get();

                    // Snapshot the current scroll position to drive non-interactive keyboard animations.
                    scrollOffsetAtKeyboardStart.set(vScrollOffset);

                    const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromInset(keyboardHeight.get());

                    // When topItemInset is active, keyboard shares the bottom space
                    const vTopItemInset = topItemInset.get();
                    const scrollAdjustment = Math.max(0, vEffectiveKeyboardHeight - vTopItemInset);

                    const targetOffset = Math.max(
                        0,
                        vIsOpening ? vScrollOffset + scrollAdjustment : vScrollOffset - scrollAdjustment,
                    );
                    scrollOffsetY.set(targetOffset);
                    animatedOffsetY.set(targetOffset);
                    keyboardInset.set(vEffectiveKeyboardHeight);
                    runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);

                    runOnJS(setScrollProcessingEnabled)(false);
                }
            },
            onInteractive: (event) => {
                "worklet";

                // Interactive updates happen while dragging/swiping the keyboard.
                if (animationMode.get() !== "running") {
                    runOnJS(setScrollProcessingEnabled)(false);
                }

                animationMode.set("running");

                if (!didInteractive.get()) {
                    didInteractive.set(true);
                }

                if (shouldUpdateAlignItemsAtEndMinSize.get() && !horizontal && avoidKeyboard) {
                    const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromEvent(event.height);
                    runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
                }
            },
            onMove: (event) => {
                "worklet";

                const vIsOpening = isOpening.get();

                if (!horizontal && avoidKeyboard && !vIsOpening && shouldUpdateAlignItemsAtEndMinSize.get()) {
                    const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromEvent(event.height);
                    runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
                }
            },
            onEnd: (event) => {
                "worklet";

                // Transition ended: finalize offsets/insets and return control to normal scrolling.
                const wasInteractive = didInteractive.get();

                const vMode = animationMode.get();
                animationMode.set("idle");

                if (vMode === "running") {
                    const progress = clampProgress(event.progress);
                    const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromInset(keyboardHeight.get());
                    const vIsOpening = isOpening.get();

                    // When topItemInset is active, keyboard shares the bottom space
                    const vTopItemInset = topItemInset.get();
                    const scrollAdjustment = Math.max(0, vEffectiveKeyboardHeight - vTopItemInset);

                    if (!wasInteractive) {
                        const targetOffset = calculateKeyboardTargetOffset(
                            scrollOffsetAtKeyboardStart.get(),
                            scrollAdjustment,
                            vIsOpening,
                            progress,
                        );

                        // Set both scrollOffsetY and animatedOffsetY so that it sets the new scroll position
                        // and also makes sure scrollOffsetY is up to date
                        scrollOffsetY.set(targetOffset);
                        animatedOffsetY.set(targetOffset);
                    }

                    runOnJS(setScrollProcessingEnabled)(true);

                    didInteractive.set(false);

                    isKeyboardOpen.set(event.height > 0);

                    if (!horizontal) {
                        const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
                        keyboardInset.set(newInset);

                        // max, not sum: topItemInset is calculated against full scrollLength,
                        // so it already encompasses keyboard space
                        runOnJS(reportContentInset)(Math.max(newInset, vTopItemInset));

                        if (!vIsOpening) {
                            runOnJS(updateAlignItemsAtEndMinSize)(newInset);
                        }

                        if (newInset <= 0) {
                            // Clear any stale animated offset once the keyboard is fully dismissed.
                            animatedOffsetY.set(scrollOffsetY.get());
                        }
                    }
                }

                if (onKeyboardTransitionEnd) {
                    runOnJS(onKeyboardTransitionEnd)(event.height > 0);
                }
            },
        },
        [
            avoidKeyboard,
            clearAlignItemsAtEndMinSize,
            getEffectiveKeyboardHeightFromEvent,
            getEffectiveKeyboardHeightFromInset,
            horizontal,
            onKeyboardTransitionEnd,
            reportContentInset,
            safeAreaInsetBottom,
            scrollViewRef,
            setScrollProcessingEnabled,
            updateAlignItemsAtEndMinSize,
        ],
    );

    const animatedProps = useAnimatedProps<ScrollViewProps>(() => {
        "worklet";

        const vAnimatedOffsetY = animatedOffsetY.get() as number | null;

        // Setting contentOffset animates the scroll with the keyboard
        const baseProps: ScrollViewProps = {
            contentOffset:
                vAnimatedOffsetY === null
                    ? undefined
                    : {
                          x: 0,
                          y: vAnimatedOffsetY,
                      },
        };

        const keyboardInsetBottom = keyboardInset.get();
        const vTopItemInset = topItemInset.get();
        // max, not sum: topItemInset is calculated against full scrollLength,
        // so it already encompasses keyboard space
        const totalInsetBottom = Math.max(keyboardInsetBottom, vTopItemInset);

        const contentInset = {
            bottom: (contentInsetProp?.bottom ?? 0) + (horizontal ? 0 : totalInsetBottom),
            left: contentInsetProp?.left ?? 0,
            right: contentInsetProp?.right ?? 0,
            top: contentInsetProp?.top ?? 0,
        };

        // On iOS we can use contentInset to pad from the bottom
        return Object.assign(baseProps, { contentInset });
    });

    const contentContainerStyle = useMemo(() => {
        const styles: any[] = [];

        if (contentContainerStyleProp) {
            styles.push(contentContainerStyleProp);
        }

        if (alignItemsAtEndMinSize !== undefined) {
            const minSizeStyle = horizontal
                ? { minWidth: alignItemsAtEndMinSize }
                : { minHeight: alignItemsAtEndMinSize };
            styles.push(minSizeStyle);
        }

        return styles.length > 0 ? styles : undefined;
    }, [alignItemsAtEndMinSize, contentContainerStyleProp, horizontal]);

    return (
        <AnimatedLegendList
            {...rest}
            animatedProps={animatedProps}
            automaticallyAdjustContentInsets={false}
            contentContainerStyle={contentContainerStyle}
            keyboardDismissMode="interactive"
            onItemSizeChanged={handleItemSizeChange}
            onMetricsChange={handleMetricsChange}
            onScroll={finalScrollHandler as unknown as AnimatedLegendListProps<ItemT>["onScroll"]}
            ref={combinedRef}
            refScrollView={scrollViewRef}
            scrollIndicatorInsets={{ bottom: 0, top: 0 }}
            style={styleProp}
        />
    );
});

export { KeyboardAvoidingLegendList as LegendList };
