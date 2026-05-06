import { getContentInsetEnd } from "@/state/getContentInsetEnd";
import type { StateContext } from "@/state/state";
import type { SharedValueLike } from "@/types.base";

function readSharedValue(sharedValue: SharedValueLike<number> | undefined) {
    if (!sharedValue) {
        return 0;
    }
    const value = typeof sharedValue.get === "function" ? sharedValue.get() : sharedValue.value;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getContentSize(ctx: StateContext) {
    const { values, state } = ctx;
    const stylePaddingTop: number = values.get("stylePaddingTop") || 0;
    const stylePaddingBottom: number = state.props.stylePaddingBottom || 0;
    const headerSize: number = values.get("headerSize") || 0;
    const footerSize: number = values.get("footerSize") || 0;
    const contentInsetBottom = getContentInsetEnd(ctx);
    const totalSize: number = state.pendingTotalSize ?? values.get("totalSize");
    const extraContentPadding = readSharedValue(state.props.extraContentPadding);
    return (
        headerSize +
        footerSize +
        totalSize +
        stylePaddingTop +
        stylePaddingBottom +
        (contentInsetBottom || 0) +
        extraContentPadding
    );
}
