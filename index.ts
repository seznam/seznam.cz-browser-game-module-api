declare global {
    interface Window {
        sbrowser_games?: AndroidApiBinding
        webkit?: {messageHandlers?: IOSApiBinding | unknown} | unknown
    }

    let sbrowser_games: unknown
    let webkit: unknown
}

type AndroidApiBinding = ApiBinding<AndroidApiMethodBinding> & {
    isTablet?: AndroidApiMethodBinding | unknown
}
type IOSApiBinding = ApiBinding<IOSApiMethodBinding>
type ApiMethodName = keyof ApiBinding<AndroidApiMethodBinding>

interface ApiBinding<MethodBinding extends AndroidApiMethodBinding | IOSApiMethodBinding> {
    terminateApp?: MethodBinding | unknown
    terminate?: MethodBinding | unknown
    gamesPlay?: MethodBinding | unknown
    gamesExit?: MethodBinding | unknown
    submitUsageStatistics?: MethodBinding | unknown
    openLoginForm?: MethodBinding | unknown
    isSignedIn?: MethodBinding | unknown
    storage_get?: MethodBinding | unknown
    storage_set?: MethodBinding | unknown
    storage_delete?: MethodBinding | unknown
}

interface AndroidApiMethodBinding {
    (...args: unknown[]): unknown
}

interface IOSApiMethodBinding {
    postMessage?: ((serializedData: string) => void) | unknown
}

const sbrowserAndroidApiBindings: AndroidApiBinding = (
    typeof sbrowser_games === 'object' && sbrowser_games ? sbrowser_games : {}
)
const sbrowserIOSApiBindings: IOSApiBinding = (() => {
    if (typeof webkit !== 'object' || !webkit || !('messageHandlers' in webkit)) {
        return {}
    }

    const webkitWithMessageHandlers = webkit as {messageHandlers?: IOSApiBinding | unknown}
    if (typeof webkitWithMessageHandlers.messageHandlers !== 'object' || !webkitWithMessageHandlers.messageHandlers) {
        return {}
    }

    return webkitWithMessageHandlers.messageHandlers
})()

export function isTablet(): boolean {
    if (typeof navigator === 'object' && navigator && typeof navigator.userAgent === 'string') {
        if (/\(iPad;/.test(navigator.userAgent)) {
            return true
        }
    }

    if (typeof sbrowserAndroidApiBindings.isTablet === 'function') {
        try {
            return !!sbrowserAndroidApiBindings.isTablet()
        } catch (sbrowserApiError) {
            console.error('SBrowser API.isTablet: failed to execute the isTabled method', sbrowserApiError)
            return false
        }
    }

    console.warn('SBrowser API.isTablet: no supported SBrowser native API is available, defaulting to false')
    return false
}

export function terminateApp(): boolean {
    return (
        callNativeVoidReturningMethod('terminateApp') ||
        callNativeVoidReturningMethod('terminate', [], 'terminate')
    )
}

export function gamesPlay(gameId: string): void {
    callNativeVoidReturningMethod('gamesPlay', [gameId])
}

export function gamesExit(): boolean {
    return callNativeVoidReturningMethod('gamesExit')
}

export function submitUsageStatistics(gameId: string, gamesPlayed: number, gamesWon: number): boolean {
    return callNativeVoidReturningMethod('submitUsageStatistics', [gameId, gamesPlayed, gamesWon], JSON.stringify({
        game: gameId,
        'games-played': gamesPlayed,
        'games-won': gamesWon,
    }))
}

export function openLoginForm(): boolean {
    return callNativeVoidReturningMethod('openLoginForm')
}

export function isSignedIn(): Promise<boolean> {
    const iosIsSignedIn = (
        sbrowserIOSApiBindings.isSignedIn &&
        typeof (sbrowserIOSApiBindings.isSignedIn as IOSApiMethodBinding).postMessage === 'function' ?
            sbrowserIOSApiBindings.isSignedIn as IOSApiMethodBinding
            :
            null
    )

    return new Promise((resolve, reject) => {
        if (typeof sbrowserAndroidApiBindings.isSignedIn === 'function') {
            try {
                const result = sbrowserAndroidApiBindings.isSignedIn()
                resolve(result)
                return
            } catch (sbrowserApiError) {
                console.error('SBrowser API.isSignedIn: Failed to execute the isSignedIn method', sbrowserApiError)
                reject(sbrowserApiError)
                return
            }
        } else if (iosIsSignedIn && typeof iosIsSignedIn.postMessage === 'function') {
            try {
                window.sbrowser_games = window.sbrowser_games || {}
                window.sbrowser_games.isSignedIn = (isUserSignedIn: boolean) => {
                    resolve(!!isUserSignedIn)
                    if (window.sbrowser_games && typeof window.sbrowser_games.isSignedIn === 'function') {
                        delete window.sbrowser_games.isSignedIn
                    }
                }
                iosIsSignedIn.postMessage('')
                return
            } catch (sbrowserApiError) {
                console.error('SBrowser API.isSignedIn: Failed to execute the isSignedIn method', sbrowserApiError)
                reject(sbrowserApiError)
                return
            }
        } else {
            reject(new Error('No supported native SBrowser API is available'))
        }
    })
}

export interface Storage {
    get(key: string): Promise<unknown | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
}

export function getStorage(): Storage | null {
    const methods = ['get', 'set', 'delete'] as const
    if (
        methods.some(methodName => typeof sbrowserAndroidApiBindings[`storage_${methodName}`] !== 'function') &&
        methods.some(methodName =>
            !sbrowserIOSApiBindings[`storage_${methodName}`] ||
            typeof (sbrowserIOSApiBindings[`storage_${methodName}`] as IOSApiMethodBinding).postMessage !== 'function'
        )
    ) {
        return null
    }

    return {
        get(key: string): Promise<unknown> {
            return executeOperation('storage_get', key)
        },
        set(key: string, value: unknown): Promise<void> {
            return executeOperation('storage_set', key, value) as Promise<void>
        },
        delete(key: string): Promise<void> {
            return executeOperation('storage_delete', key) as Promise<void>
        },
    }

    function executeOperation(methodName: ApiMethodName, key: string, value: unknown = undefined): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const {callbackID} = createCallback(resolve, reject)
            const serializedValue = value === undefined ? value : JSON.stringify(value)
            const androidArgs = value === undefined ? [key] : [key, serializedValue]
            const iOSArg = JSON.stringify(
                value === undefined ? {key, callbackID} : {key, value: serializedValue, callbackID},
            )
            const result = callNativeMethod(methodName, androidArgs, iOSArg)
            if (result.usedImplementation === 'Android') {
                delete (window.sbrowser_games as {[id: string]: unknown})[callbackID]
                if (result.thrownError) {
                    reject(result.thrownError)
                } else {
                    const {returnedValue} = result
                    resolve(typeof returnedValue === 'string' ? JSON.parse(returnedValue) : null)
                }
            }
        })
    }

    function createCallback(
        resolve: (value: unknown) => void,
        reject: (error: Error) => void,
    ): {callbackID: string, callback: (error: Error | undefined, value: unknown) => void} {
        const callbackID = createGlobalCallback((error, value) => {
            if (error) {
                reject(error)
            } else if (value === null || value === undefined) {
                resolve(null)
            } else {
                resolve(JSON.parse(value as string))
            }
        })
        const callback = (
            window.sbrowser_games as {[id: string]: (error: Error | undefined, value: unknown) => void}
        )[callbackID]
        return {callbackID, callback}
    }

    function createGlobalCallback(callback: (error: Error | undefined, value: unknown) => void): string {
        window.sbrowser_games = window.sbrowser_games || {}
        const callbackIdPrefix = `${Date.now()}` + Math.floor(Math.random() * 8_192)
        let idCounter = 0
        while (`callback_${callbackIdPrefix}_${idCounter}` in window.sbrowser_games) {
            idCounter++
        }
        const callbackId = `callback_${callbackIdPrefix}_${idCounter}`
        ;(window.sbrowser_games as {[id: string]: (error: Error | undefined, value: unknown) => void})[callbackId] = (
            error: Error | undefined,
            value: unknown,
        ): void => {
            delete (window.sbrowser_games as {[id: string]: unknown})[callbackId]
            callback(error, value)
        }
        return callbackId
    }
}

function callNativeVoidReturningMethod(
    methodName: ApiMethodName,
    androidArguments: readonly unknown[] = [],
    iosArgument = '',
): boolean {
    const callResult = callNativeMethod(methodName, androidArguments, iosArgument)
    return callResult.usedImplementation !== null && callResult.thrownError === null
}

function callNativeMethod(
    methodName: ApiMethodName,
    androidArguments: readonly unknown[] = [],
    iosArgument = '',
): {usedImplementation: 'Android' | 'iOS' | null, returnedValue: unknown, thrownError: Error | null} {
    if (typeof sbrowserAndroidApiBindings[methodName] === 'function') {
        try {
            const returnedValue = (sbrowserAndroidApiBindings[methodName] as AndroidApiMethodBinding)(...androidArguments)
            return {
                usedImplementation: 'Android',
                returnedValue,
                thrownError: null,
            }
        } catch (sbrowserApiError) {
            console.error(`SBrowser API.${methodName}: Failed to execute the ${methodName} method`, sbrowserApiError)
            return {
                usedImplementation: 'Android',
                returnedValue: undefined,
                thrownError: sbrowserApiError instanceof Error ? sbrowserApiError : new Error(`${sbrowserApiError}`),
            }
        }
    }

    const iosMethodBinding = (
        sbrowserIOSApiBindings[methodName] &&
        typeof (sbrowserIOSApiBindings[methodName] as IOSApiMethodBinding).postMessage === 'function' ?
            sbrowserIOSApiBindings[methodName] as IOSApiMethodBinding
            :
            null
    )

    if (iosMethodBinding && typeof iosMethodBinding.postMessage === 'function') {
        try {
            const returnedValue = iosMethodBinding.postMessage(iosArgument)
            return {
                usedImplementation: 'iOS',
                returnedValue,
                thrownError: null,
            }
        } catch (sbrowserApiError) {
            console.error(`SBrowser API.${methodName}: Failed to execute the ${methodName} method`, sbrowserApiError)
            return {
                usedImplementation: 'iOS',
                returnedValue: undefined,
                thrownError: sbrowserApiError instanceof Error ? sbrowserApiError : new Error(`${sbrowserApiError}`),
            }
        }
    }

    return {
        usedImplementation: null,
        returnedValue: undefined,
        thrownError: null,
    }
}
