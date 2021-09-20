declare global {
    interface Window {
        sbrowser?: AndroidApiBinding
        webkit?: {messageHandlers?: IOSApiBinding | unknown} | unknown
    }

    let sbrowser: unknown
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
    openLoginForm?: MethodBinding | unknown
    isSignedIn?: MethodBinding | unknown
}

interface AndroidApiMethodBinding {
    (...args: unknown[]): unknown
}

interface IOSApiMethodBinding {
    postMessage?: ((serializedData: string) => void) | unknown
}

const sbrowserAndroidApiBindings: AndroidApiBinding = typeof sbrowser === 'object' && sbrowser ? sbrowser : {}
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

export function gamesExit(gameId: string, gamesPlayed: number, gamesWon: number): boolean {
    return callNativeVoidReturningMethod('gamesExit', [gameId, gamesPlayed, gamesWon], JSON.stringify({
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
                window.sbrowser = window.sbrowser || {}
                window.sbrowser.isSignedIn = (isUserSignedIn: boolean) => {
                    resolve(!!isUserSignedIn)
                    if (window.sbrowser && window.sbrowser.isSignedIn) {
                        delete window.sbrowser.isSignedIn
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

function callNativeVoidReturningMethod(
    methodName: ApiMethodName,
    androidArguments: readonly unknown[] = [],
    iosArgument = '',
): boolean {
    if (typeof sbrowserAndroidApiBindings[methodName] === 'function') {
        try {
            (sbrowserAndroidApiBindings[methodName] as AndroidApiMethodBinding)(...androidArguments)
            return true
        } catch (sbrowserApiError) {
            console.error(`SBrowser API.${methodName}: Failed to execute the ${methodName} method`, sbrowserApiError)
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
            iosMethodBinding.postMessage(iosArgument)
            return true
        } catch (sbrowserApiError) {
            console.error(`SBrowser API.${methodName}: Failed to execute the ${methodName} method`, sbrowserApiError)
        }
    }

    return false
}
