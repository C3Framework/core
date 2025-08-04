import { CommonUserstate, SubMethods } from "tmi.js";

export type LastData = {
    state?: CommonUserstate,
    message?: string,
    username?: string,
    months?: number,
    subs?: number,
    enabled?: boolean,
    methods?: SubMethods,
    recipient?: string,
    duration?: number,
    reward?: string,
    sender?: string,
}