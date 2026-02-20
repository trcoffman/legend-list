// biome-ignore lint/correctness/noUnusedImports: Leaving this out makes it crash in some environments
import * as React from "react";
import { type ForwardedRef, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Insets, Platform, type ScrollViewProps, StyleSheet } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import type Animated from "react-native-reanimated";
import {
    runOnJS,
    useAnimatedProps,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";
import type { ReanimatedScrollEvent } from "react-native-reanimated/lib/typescript/hook/commonTypes";

import type { LegendListMetrics, LegendListRef, TypedForwardRef } from "@legendapp/list";
import { AnimatedLegendList, type AnimatedLegendListProps } from "@legendapp/list/reanimated";
import { useCombinedRef } from "@/hooks/useCombinedRef";

type KeyboardControllerLegendListProps<ItemT> = Omit<
    AnimatedLegendListProps<ItemT>,
    "onScroll" | "contentInset" | "automaticallyAdjustContentInsets"
> & {
    onScroll?: (event: ReanimatedScrollEvent) => void;
    contentInset?: Insets | undefined;
    safeAreaInsetBottom?: number;
    avoidKeyboard?: boolean;
    topItemIndex?: number;
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
        onMetricsChange: onMetricsChangeProp,
        onScroll: onScrollProp,
        safeAreaInsetBottom = 0,
        style: styleProp,
        ...rest
    } = props;

    const { alignItemsAtEnd, avoidKeyboard: avoidKeyboardProp, topItemIndex } = props;

    const avoidKeyboard = !!(avoidKeyboardProp || alignItemsAtEnd);

    const styleFlattened = StyleSheet.flatten(styleProp) as ScrollViewProps;
    const refLegendList = useRef<LegendListRef | null>(null);
    const combinedRef = useCombinedRef(forwardedRef, refLegendList);

    const isIos = Platform.OS === "ios";
    const isAndroid = Platform.OS === "android";
    const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
    const scrollOffsetY = useSharedValue(0);
    const animatedOffsetY = useSharedValue<number | null>(null);
    const scrollOffsetAtKeyboardStart = useSharedValue(0);
    const mode = useSharedValue<"idle" | "running">("idle");
    const keyboardInset = useSharedValue(0);
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
    const [topItemInsetState, setTopItemInsetState] = useState(0);
    const [avoidKeyboardMinSize, setAlignItemsAtEndMinSize] = useState<number | undefined>(undefined);

    const scrollHandler = useAnimatedScrollHandler(
        (event) => {
            if (mode.get() !== "running" || didInteractive.get()) {
                scrollOffsetY.set(event.contentOffset[horizontal ? "x" : "y"]);
            }
            if (onScrollProp) {
                runOnJS(onScrollProp)(event);
            }
        },
        [onScrollProp, horizontal],
    );

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

    const updateAlignItemsAtEndMinSize = useCallback(
        (nextKeyboardInset?: number) => {
            if (isAndroid) {
                return;
            }
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
        // Skip if topItemIndex not provided or invalid
        if (topItemIndex === undefined || topItemIndex < 0) {
            if (topItemInset.get() !== 0) {
                topItemInset.set(0);
                if (isAndroid) {
                    setTopItemInsetState(0);
                }
            }
            return;
        }

        const state = refLegendList.current?.getState();
        if (!state) {
            return;
        }
        console.log(
            "Item sizes",
            Array.from({ length: state.data.length }, (_, i) => state.sizeAtIndex(i)),
        );

        const dataLength = state.data.length;
        const vScrollLength = state.scrollLength;

        // Handle out of bounds
        if (topItemIndex >= dataLength || vScrollLength <= 0) {
            if (topItemInset.get() !== 0) {
                topItemInset.set(0);
                if (isAndroid) {
                    setTopItemInsetState(0);
                }
            }
            return;
        }

        // Sum sizes from topItemIndex to end
        let sumOfSizes = 0;
        for (let i = topItemIndex; i < dataLength; i++) {
            const size = state.sizeAtIndex(i);
            if (size !== undefined && size > 0) {
                sumOfSizes += size;
            }
            // Note: If size is undefined, item hasn't been measured yet
            // We skip it - once measured, onItemSizeChanged will trigger recalc
        }

        const newTopItemInset = Math.max(0, vScrollLength - sumOfSizes);
        console.log("🪵RVK keyboard.tsx:226 ", { vScrollLength, sumOfSizes, newTopItemInset }, "RVK");

        if (topItemInset.get() !== newTopItemInset) {
            topItemInset.set(newTopItemInset);
            // Update state for Android (used for paddingBottom on content container)
            if (isAndroid) {
                setTopItemInsetState(newTopItemInset);
            }
            // Report combined inset to LegendList
            // On Android, topItemInset is handled via paddingBottom on content container,
            // so don't include it in reportContentInset (would be double-counted)
            const vKeyboardInset = keyboardInset.get();
            if (isAndroid) {
                reportContentInset(vKeyboardInset);
            } else {
                reportContentInset(Math.max(vKeyboardInset, newTopItemInset));
            }
        }
    }, [topItemIndex, topItemInset, keyboardInset, reportContentInset]);

    const updateScrollMetrics = useCallback(() => {
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
            // Recalculate if changed item is at or after topItemIndex
            // Use requestAnimationFrame to let the layout settle before updating inset
            if (topItemIndex !== undefined && info.index >= topItemIndex) {
                requestAnimationFrame(() => {
                    calculateTopItemInset();
                });
            }
        },
        [topItemIndex, calculateTopItemInset],
    );

    useEffect(() => {
        updateAlignItemsAtEndMinSize();
    }, [updateAlignItemsAtEndMinSize]);

    // Recalculate topItemInset when topItemIndex changes
    useEffect(() => {
        calculateTopItemInset();
    }, [topItemIndex, calculateTopItemInset]);

    // Recalculate topItemInset when data length changes
    // Use requestAnimationFrame to let the new content render first
    useEffect(() => {
        if (topItemIndex !== undefined) {
            requestAnimationFrame(() => {
                calculateTopItemInset();
            });
        }
    }, [props.data?.length, topItemIndex, calculateTopItemInset]);

    useKeyboardHandler(
        // biome-ignore assist/source/useSortedKeys: prefer start/move/end
        {
            onStart: (event) => {
                "worklet";

                mode.set("running");

                const progress = clampProgress(event.progress);

                // Ignore spurious events when keyboard is already open
                if (isKeyboardOpen.get() && progress >= 1 && event.height > 0) {
                    return;
                }

                if (!didInteractive.get()) {
                    if (event.height > 0) {
                        // Convert keyboard height into list space by removing the bottom safe-area.
                        keyboardHeight.set(event.height - safeAreaInsetBottom);
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

                    if (isIos) {
                        const vContentLength = contentLength.get();
                        const vScrollLength = scrollLength.get();
                        const vKeyboardHeight = keyboardHeight.get();

                        const vEffectiveKeyboardHeight = calculateEffectiveKeyboardHeight(
                            vKeyboardHeight,
                            vContentLength,
                            vScrollLength,
                            avoidKeyboard,
                        );

                        // When topItemInset is active, keyboard shares the bottom space
                        // Only scroll by the amount that exceeds the existing topItemInset
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
                    } else if (isAndroid) {
                        animatedOffsetY.set(vScrollOffset);
                    }

                    runOnJS(setScrollProcessingEnabled)(false);
                }
            },
            onInteractive: (event) => {
                "worklet";

                if (mode.get() !== "running") {
                    runOnJS(setScrollProcessingEnabled)(false);
                }

                mode.set("running");

                if (!didInteractive.get()) {
                    didInteractive.set(true);
                }

                if (isAndroid && !horizontal) {
                    const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
                    keyboardInset.set(newInset);
                }

                if (shouldUpdateAlignItemsAtEndMinSize.get() && !horizontal && avoidKeyboard) {
                    const vKeyboardHeight = calculateKeyboardInset(event.height, safeAreaInsetBottom);
                    const vEffectiveKeyboardHeight = calculateEffectiveKeyboardHeight(
                        vKeyboardHeight,
                        contentLength.get(),
                        scrollLength.get(),
                        avoidKeyboard,
                    );
                    runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
                }
            },
            onMove: (event) => {
                "worklet";

                const vIsOpening = isOpening.get();

                if (isAndroid) {
                    if (!didInteractive.get()) {
                        const progress = clampProgress(event.progress);
                        const vKeyboardHeight = keyboardHeight.get();
                        const vEffectiveKeyboardHeight = calculateEffectiveKeyboardHeight(
                            vKeyboardHeight,
                            contentLength.get(),
                            scrollLength.get(),
                            avoidKeyboard,
                        );

                        // When topItemInset is active, keyboard shares the bottom space
                        // Only scroll by the amount that exceeds the existing topItemInset
                        const vTopItemInset = topItemInset.get();
                        const scrollAdjustment = Math.max(0, vEffectiveKeyboardHeight - vTopItemInset);

                        const targetOffset = calculateKeyboardTargetOffset(
                            scrollOffsetAtKeyboardStart.get(),
                            scrollAdjustment,
                            vIsOpening,
                            progress,
                        );

                        scrollOffsetY.set(targetOffset);
                        animatedOffsetY.set(targetOffset);
                    }

                    if (!horizontal) {
                        const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
                        keyboardInset.set(newInset);
                    }
                }

                if (!horizontal && avoidKeyboard && !vIsOpening && shouldUpdateAlignItemsAtEndMinSize.get()) {
                    const vKeyboardHeight = calculateKeyboardInset(event.height, safeAreaInsetBottom);
                    const vEffectiveKeyboardHeight = calculateEffectiveKeyboardHeight(
                        vKeyboardHeight,
                        contentLength.get(),
                        scrollLength.get(),
                        avoidKeyboard,
                    );
                    runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
                }
            },
            onEnd: (event) => {
                "worklet";

                const wasInteractive = didInteractive.get();

                const vMode = mode.get();
                mode.set("idle");

                if (vMode === "running") {
                    const progress = clampProgress(event.progress);
                    const vKeyboardHeight = keyboardHeight.get();
                    const vEffectiveKeyboardHeight = calculateEffectiveKeyboardHeight(
                        vKeyboardHeight,
                        contentLength.get(),
                        scrollLength.get(),
                        avoidKeyboard,
                    );
                    const vIsOpening = isOpening.get();

                    // When topItemInset is active, keyboard shares the bottom space
                    // Only scroll by the amount that exceeds the existing topItemInset
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

                        // On Android, topItemInset is handled via paddingBottom on content container,
                        // so don't include it in reportContentInset (would be double-counted)
                        if (isAndroid) {
                            runOnJS(reportContentInset)(newInset);
                        } else {
                            runOnJS(reportContentInset)(Math.max(newInset, vTopItemInset));
                        }

                        if (!vIsOpening) {
                            runOnJS(updateAlignItemsAtEndMinSize)(newInset);
                        }

                        if (newInset <= 0) {
                            // Clear any stale animated offset once the keyboard is fully dismissed.
                            animatedOffsetY.set(scrollOffsetY.get());
                        }
                    }
                }
            },
        },
        [avoidKeyboard, horizontal, safeAreaInsetBottom, scrollViewRef],
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

        if (isIos) {
            const keyboardInsetBottom = keyboardInset.get();
            const vTopItemInset = topItemInset.get();
            // Use max instead of sum - keyboard and topItemInset share the same bottom space
            const totalInsetBottom = Math.max(keyboardInsetBottom, vTopItemInset);

            const contentInset = {
                bottom: (contentInsetProp?.bottom ?? 0) + (horizontal ? 0 : totalInsetBottom),
                left: contentInsetProp?.left ?? 0,
                right: contentInsetProp?.right ?? 0,
                top: contentInsetProp?.top ?? 0,
            };

            // On iOS we can use contentInset to pad from the bottom
            return Object.assign(baseProps, {
                contentInset,
            });
        } else {
            return baseProps;
        }
    });

    // contentInset is not supported on Android so we have to use marginBottom for keyboard
    // and paddingBottom on content container for topItemInset
    const style = isAndroid
        ? useAnimatedStyle(
              () => ({
                  ...(styleFlattened || {}),
                  marginBottom: keyboardInset.get(),
              }),
              [styleProp, keyboardInset],
          )
        : styleProp;

    const contentContainerStyle = useMemo(() => {
        const styles: any[] = [];

        if (contentContainerStyleProp) {
            styles.push(contentContainerStyleProp);
        }

        // On Android, use paddingBottom for topItemInset since contentInset isn't supported
        if (isAndroid && topItemInsetState > 0) {
            styles.push({ paddingBottom: topItemInsetState });
        }

        if (avoidKeyboardMinSize !== undefined) {
            const minSizeStyle = horizontal ? { minWidth: avoidKeyboardMinSize } : { minHeight: avoidKeyboardMinSize };
            styles.push(minSizeStyle);
        }

        return styles.length > 0 ? styles : undefined;
    }, [avoidKeyboardMinSize, contentContainerStyleProp, horizontal, topItemInsetState]);

    return (
        <AnimatedLegendList
            {...rest}
            animatedProps={animatedProps}
            automaticallyAdjustContentInsets={false}
            contentContainerStyle={contentContainerStyle}
            keyboardDismissMode="interactive"
            onItemSizeChanged={handleItemSizeChange}
            onMetricsChange={handleMetricsChange}
            onScroll={scrollHandler as unknown as AnimatedLegendListProps<ItemT>["onScroll"]}
            ref={combinedRef}
            refScrollView={scrollViewRef}
            scrollIndicatorInsets={{ bottom: 0, top: 0 }}
            style={style}
        />
    );
});

export { KeyboardAvoidingLegendList as LegendList };
