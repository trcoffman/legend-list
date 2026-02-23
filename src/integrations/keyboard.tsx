// biome-ignore lint/correctness/noUnusedImports: Leaving this out makes it crash in some environments
import * as React from "react";
import { type ForwardedRef, forwardRef } from "react";
import type { Insets } from "react-native";
import type { ScrollEvent as ReanimatedScrollEvent, ScrollHandlerProcessed } from "react-native-reanimated";

import type { LegendListRef, TypedForwardRef } from "@legendapp/list/react-native";
import { AnimatedLegendList, type AnimatedLegendListProps } from "@legendapp/list/reanimated";

type KeyboardOnScrollCallback = (event: ReanimatedScrollEvent) => void;
type KeyboardOnScrollHandler = KeyboardOnScrollCallback | ScrollHandlerProcessed<Record<string, unknown>>;

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

// biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
export const KeyboardAvoidingLegendList = (forwardRef as TypedForwardRef)(function KeyboardAvoidingLegendList<ItemT>(
    props: KeyboardControllerLegendListProps<ItemT>,
    forwardedRef: ForwardedRef<LegendListRef>,
) {
    const {
        avoidKeyboard: _avoidKeyboard,
        contentInset: _contentInset,
        onKeyboardTransitionEnd: _onKeyboardTransitionEnd,
        safeAreaInsetBottom: _safeAreaInsetBottom,
        topItemIndex: _topItemIndex,
        ...rest
    } = props;

    return <AnimatedLegendList {...(rest as AnimatedLegendListProps<ItemT>)} ref={forwardedRef} />;
});

export { KeyboardAvoidingLegendList as LegendList };
