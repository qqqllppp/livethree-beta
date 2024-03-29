import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom';
import {
    increment, doc, setDoc, getDoc, getDocs, updateDoc,
    deleteDoc, serverTimestamp, orderBy, limit, query, where
} from "firebase/firestore"
import {
    COL_REF_PROMO1, COL_REF_REFERRALS, COL_REF_USERS,
    COL_REF_CALLER_HAS_ROOM, getColRefActive, getColRefHistoryKey,
    functions, analytics
} from '../services/firebase';
import { logEvent } from 'firebase/analytics';

import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { useHttpsCallable } from 'react-firebase-hooks/functions';
import { useWeb3Auth } from '../contexts/Web3Auth';
import { useSuperfluidGas } from '../contexts/SuperfluidGas';

import { useUpdateEffect } from '../hooks/useUpdateEffect'
import { useInterval } from '../hooks/useInterval'
import { usePrevious } from '../hooks/usePrevious'
import { useEffectOnce } from '../hooks/useEffectOnce';
import { useTimeoutFn } from '../hooks/useTimeoutFn';

import { useSnackbar } from 'notistack';
// import { useLogoutFlow } from "../hooks/useLogoutFlow";
import useSound from 'use-sound';

import ringtone from '../assets/ringtone.wav'

import {
    ROLE_CALLER, ROLE_CALLEE, CALL_PENDING_EXPIRE_IN_MS,
    PLACEHOLDER_ADDRESS, END_CALL_BUFFER_SECONDS, CALL_HISTORY_LIMIT,
    REFERRAL_MIN_DURATION_S, POLYGON_ADDRESS_USDCx, MUMBAI_ADDRESS_fUSDCx,
    CHAIN_NUMBER_POLYGON, CHAIN_NUMBER_MUMBAI, ADMIN_ADDRESS, PROMO1_COUNT,
} from '../constants/constants'

import {
    useHMSActions,
    useHMSStore,
    useHMSNotifications,
    selectIsConnectedToRoom,
    selectPeerCount,
    HMSNotificationTypes,
} from "@100mslive/react-sdk";
import { ethers } from 'ethers';

import Button from '@mui/material/Button';

// import axios from 'axios';

export interface ICallContext {
    isInitiating: boolean
    isEntering: boolean
    isEnding: boolean
    activeCallMaxSeconds: string
    flowDeposit: any
    isRingtoneEnabled: boolean
    isCalleeInCall: boolean
    hasRoom: boolean
    historyData: any,
    isCaller: boolean,
    setIsEntering: (value: boolean) => void
    initiateCall: (calleeAddress: any) => Promise<void>;
    acceptCall: (callerAddress: any, roomId: any) => Promise<void>;
    cleanUp: (calleeAddress: any, callerAddress: any, active?: boolean, reason?: string, initiateEnd?: boolean) => Promise<void>;
    clearPendingCall: () => void
    clearActiveCallBatch: () => void
    setIsRingtoneEnabled: (value: boolean) => void
}

export const CallContext = createContext<ICallContext>({
    isInitiating: false,
    isEntering: false,
    isEnding: false,
    activeCallMaxSeconds: "0",
    flowDeposit: null,
    isRingtoneEnabled: true,
    isCalleeInCall: false,
    hasRoom: false,
    historyData: [],
    isCaller: false,
    setIsEntering: (value: boolean) => { },
    initiateCall: async (calleeAddress: any) => { },
    acceptCall: async (callerAddress: any, roomId: any) => { },
    cleanUp: async (calleeAddress: any, callerAddress: any, active?: boolean, reason?: string, initiateEnd?: boolean) => { },
    clearPendingCall: () => { },
    clearActiveCallBatch: () => { },
    setIsRingtoneEnabled: (value: boolean) => { },
})

export const useCall = (): ICallContext => {
    return useContext(CallContext);
}

type LocationProps = {
    state: {
        from: Location;
    };
};

export const CallProvider = ({ children }: { children: JSX.Element }) => {
    const { address: localAddress, chainId } = useWeb3Auth()
    const {
        createFlow, isCreatingFlow, errorCreatingFlow, setErrorCreatingFlow,
        deleteFlow, isDeletingFlow, errorDeletingFlow, setErrorDeletingFlow,
        isTransactionPending, getFlowData, getTokenXBalance
    } = useSuperfluidGas()

    // const { logout } = useLogoutFlow(localAddress)

    const [isCallee, setIsCallee] = useState<boolean>(false)
    const [isCaller, setIsCaller] = useState<boolean>(false)
    const [otherAddress, setOtherAddress] = useState<string>(PLACEHOLDER_ADDRESS)
    const [theCalleeAddress, setTheCalleeAddress] = useState<string>(PLACEHOLDER_ADDRESS)
    const [theCallerAddress, setTheCallerAddress] = useState<string>(PLACEHOLDER_ADDRESS)

    const isConnectedToRoom = useHMSStore(selectIsConnectedToRoom);
    const [localUserData] = useDocumentData<any>(doc(COL_REF_USERS, localAddress));
    const [activeCalls, loadingActiveCalls, activeCallsError] = useCollectionData(getColRefActive(localAddress || PLACEHOLDER_ADDRESS));
    const [activeRoomData, isLoadingActiveRoomData, activeRoomDataError] = useDocumentData(doc(getColRefActive(theCalleeAddress), theCallerAddress));
    const [asCallerData] = useDocumentData(doc(COL_REF_CALLER_HAS_ROOM, localAddress))
    const [hasRoom, setHasRoom] = useState<boolean>(false)
    useEffect(() => {
        setHasRoom(asCallerData?.hasRoom)
    }, [asCallerData])

    const [effectiveFlowRate, setEffectiveFlowRate] = useState<string>("0")
    const [effectiveFlowDeposit, setEffectiveFlowDeposit] = useState<string>("0")
    const [isCheckFlow, setIsCheckFlow] = useState<boolean>(false)

    const [isRingtoneEnabled, setIsRingtoneEnabled] = useState<boolean>(true)
    const [play, { stop }] = useSound(ringtone, { soundEnabled: isRingtoneEnabled });
    const [isRinging, setIsRinging] = useState<boolean>(false)
    const hmsActions = useHMSActions();
    const navigate = useNavigate();
    const location = useLocation() as unknown as LocationProps; // https://github.com/reach/router/issues/414#issuecomment-1056839570
    const prevLocation = usePrevious(location) as unknown as LocationProps;

    const { enqueueSnackbar, closeSnackbar } = useSnackbar();
    const [isCheckForRingAgain, setIsCheckForRingAgain] = useState<boolean>(false)

    const [createRoom, isCreatingRoom, createRoomError] = useHttpsCallable(functions, 'createRoom');
    const [fetchToken, isFetchingToken, fetchTokenError] = useHttpsCallable(functions, 'generateAccessToken');

    const [isInitiating, setIsInitiating] = useState<boolean>(false)
    const [isEntering, setIsEntering] = useState<boolean>(false)
    const [isEnding, setIsEnding] = useState<boolean>(false)
    const [isCallerInCall, setIsCallerInCall] = useState<boolean>(false)
    const [isCalleeInCall, setIsCalleeInCall] = useState<boolean>(false)

    // query historic calls here so that lower cost on db
    const q = query(getColRefHistoryKey(localAddress || PLACEHOLDER_ADDRESS), orderBy("timestamp", "desc"), limit(CALL_HISTORY_LIMIT))
    const [historicCalls, loadingHistoricCalls, historicCallsError] = useCollectionData(q);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [alreadyRan, setAlreadyRan] = useState<boolean>(false)

    useEffect(() => {
        if (historicCalls && historicCalls?.length > 0) {
            setHistoryData(oldArray => [])
        }
    }, [historicCalls, localAddress])
    useEffect(() => {
        const getDetails = async () => {
            if (!historicCalls) {
                return
            }
            for (var i = 0; i < historicCalls?.length; i++) {
                const callerAddress = historicCalls?.[i].caller
                const calleeAddress = historicCalls?.[i].callee
                const timestamp = historicCalls?.[i].timestamp

                let useAddress: string
                let isIncomingCall: boolean
                if (callerAddress !== localAddress) {
                    useAddress = callerAddress
                    isIncomingCall = true
                } else {
                    useAddress = calleeAddress
                    isIncomingCall = false
                }

                const q = query(COL_REF_USERS, where("address", "==", useAddress));
                const querySnapshot = await getDocs(q)
                if (querySnapshot.size === 1) {
                    console.warn("LiveThree: DB queried - history")
                    querySnapshot.forEach((doc) => {
                        setHistoryData(oldData => [...oldData, { ...doc.data(), timestamp: timestamp, isIncomingCall: isIncomingCall }])
                    });
                } else {
                    console.error("should not return more than 1")
                }
            }
            setAlreadyRan(false)
        }
        if (historyData.length === 0 && historicCalls && localAddress && !alreadyRan) {
            setAlreadyRan(true)
            getDetails()
        }


    }, [historyData, alreadyRan, historicCalls, localAddress]);

    //
    // const [turnTapOn, turningOn, turnOnError] = useHttpsCallable(functions, 'turnTapOn');
    const [turnTapOff, turningOff, turnOffError] = useHttpsCallable(functions, 'turnTapOff');

    const hmsNotification = useHMSNotifications();
    const peerCount = useHMSStore(selectPeerCount);

    const [activeCallMaxSeconds, setActiveCallMaxSeconds] = useState<string>("0") // TODO: account for if user top-up mid way
    const [flowDeposit, setFlowDeposit] = useState<any>(null)

    useEffect(() => {
        if (isConnectedToRoom) {
            setIsEntering(false)
        }

    }, [isConnectedToRoom])

    useEffect(() => { // TODO: some cases if history not proper, it will have bug, checkout: https://stackoverflow.com/a/60055110
        const prevLocation_ = prevLocation?.state?.from?.pathname

        if (isCallerInCall && prevLocation_?.split("/")[1] === 'user') {
            endActiveCallFromCaller()
        } else if (isCallee && prevLocation_ && prevLocation_ === '/calls') {
            endActiveCallFromCallee()
        } else {
            // console.log("no isCaller/isCallee")
        }
    }, [location])

    useEffect(() => {
        let isAccessed = false
        activeCalls?.reverse().map((item: any, index: number) => {
            // const useKey = <div key={ index }></div>

            if (item?.callee) { // note: this setup means there can only be 1 active call at a time
                setIsCalleeInCall(true) // why set here instead of on join call clicked? because it needs to reflect in all tabs for same user
                isAccessed = true
            }
        })

        if (!isAccessed) {
            setIsCalleeInCall(false)
        }
    }, [activeCalls])

    const updateLocalInCallActivity = async (uid: any, active: boolean) => {
        await updateDoc(doc(COL_REF_USERS, uid), {
            isActive: active
        })
    }
    useEffect(() => { // so that others know u r in call (disable callicon)

        // TODO: enhance to batch operation (save cost): https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes
        if (activeRoomData && localUserData) {
            if (!localUserData?.isActive && localAddress === activeRoomData?.caller && activeRoomData?.callee) {
                updateLocalInCallActivity(localAddress, true)
            }
            if (!localUserData?.isActive && localAddress === activeRoomData?.callee) {
                updateLocalInCallActivity(localAddress, true)
            }
        } else if (!activeRoomData) {
            if (localUserData?.isActive) {
                updateLocalInCallActivity(localAddress, false)
            }
        }
    }, [activeRoomData])

    useInterval(() => {
        play()
    }, isRinging ? 2500 : null)
    useEffect(() => {
        stop()

        const ringCondition = activeCalls && activeCalls?.length > 0 && !isConnectedToRoom && !isEnding

        if (ringCondition) {

            setTimeout(() => {
                setIsCheckForRingAgain(state => !state)
            }, 5000)

        } else if (activeCalls?.length === 0 || isConnectedToRoom) {
            setIsRinging(false)
            stop()
        }
    }, [activeCalls?.length, isConnectedToRoom, isEnding])
    useEffect(() => {
        if (isCalleeInCall) {
            setIsRinging(false)
            stop()
        }
    }, [activeCalls?.length, isConnectedToRoom, isCalleeInCall])
    useEffect(() => {
        const ringCondition = activeCalls && activeCalls?.length > 0 && !isConnectedToRoom && !isEnding && !isCalleeInCall

        if (ringCondition) {
            notifyIncomingCall()
            setIsRinging(true)
        }

    }, [isCheckForRingAgain, isCalleeInCall])
    useEffect(() => {
        console.log("INCALL", isCalleeInCall)
    }, [isCalleeInCall])

    useEffect(() => {
        if (otherAddress !== PLACEHOLDER_ADDRESS && otherAddress !== localAddress && isCaller) {
            setTheCalleeAddress(otherAddress)
            setTheCallerAddress(localAddress)
        }

        if (otherAddress !== PLACEHOLDER_ADDRESS && otherAddress !== localAddress && isCallee) {
            setTheCalleeAddress(localAddress)
            setTheCallerAddress(otherAddress)
        }
    }, [otherAddress])


    // useEffect(() => { // note: important debug check
    //     if (localAddress && localUserData?.address && localAddress !== localUserData?.address) {
    //         console.error("LiveThree Error: ADDRESS NOT MATCH")
    //         console.error(localAddress)
    //         enqueueSnackbar("Multiple login detected on the browser, logging out.", { variant: 'info', autoHideDuration: 10000, action })
    //         logout()

    //         console.warn("logging out user")
    //     }
    // }, [localAddress, localUserData])

    const actionIncomingCall = (snackbarId: any) => (
        <>
            { !isConnectedToRoom &&
                <Button
                    onClick={ () => {
                        navigate("/calls")
                        closeSnackbar(snackbarId)
                    } }
                    sx={ { color: "white" } }
                >
                    View
                </Button>
            }

            <Button onClick={ () => { closeSnackbar(snackbarId) } } sx={ { color: "black" } }>
                Dismiss
            </Button>
        </>
    );
    const notifyIncomingCall = () => {
        enqueueSnackbar("Incoming call", { variant: 'info', autoHideDuration: 9000, action: actionIncomingCall })
    }
    const action = (snackbarId: any) => (
        <>
            <Button onClick={ () => { closeSnackbar(snackbarId) } } sx={ { color: "black" } }>
                Dismiss
            </Button>
        </>
    );
    const notifyCallEnded = () => {
        enqueueSnackbar("Call ended", { variant: 'info', autoHideDuration: 3500, action })
    }

    const cleanUp = async (
        calleeAddress: any,
        callerAddress: any,
        active: boolean = false,
        reason: string = "end call",
        rejectCall: boolean = false,
        simpleCleanUp: boolean = false,
    ) => {
        setIsEnding(true)

        try {
            // if (initiateEnd) { // this line is dangerous
            //     await hmsActions.endRoom(true, reason);
            // }
            await hmsActions.endRoom(true, reason);


            if (active) {
                console.log("was an active call", activeRoomData?.caller, activeRoomData?.callee)

                if (calleeAddress === localAddress) { // callee
                    let tokenXAddress
                    if (chainId === CHAIN_NUMBER_POLYGON) {
                        tokenXAddress = POLYGON_ADDRESS_USDCx
                    } else if (chainId === CHAIN_NUMBER_MUMBAI) {
                        tokenXAddress = MUMBAI_ADDRESS_fUSDCx
                    } else {
                        console.error(`${ chainId } ${ typeof chainId } not supported - turnTapOff`)
                    }

                    console.warn("delete flow - TAP")
                    try {
                        const data = {
                            chainId: chainId.toString(),
                            tokenXAddress: tokenXAddress,
                            sender: callerAddress,
                            receiver: calleeAddress,
                        }
                        const resp = await turnTapOff(data)
                        console.log(resp)

                        // await axios.post("https://us-central1-moonlight-173df.cloudfunctions.net/turnTapOffHttp", data)
                    } catch (error: any) {
                        enqueueSnackbar("Something went wrong! - turn tap off", { variant: 'error', autoHideDuration: 3000, action })
                        console.error(error)
                    }

                } else {
                    /**
                     * TODO:
                     * warning, this line might be called sometimes on callee side if call ended 
                     * from caller side either manual or using timeout end
                     * which in turn hits the 'enqueueSnackbar' error, so comment this out for now
                     * (wont hit issue if using webhooks)
                     */
                    console.warn("delete flow - GAS")
                    try {
                        await deleteFlow(callerAddress, calleeAddress)
                    } catch (error: any) {
                        // enqueueSnackbar("Something went wrong!. - Delete flow (in call)", { variant: 'error', autoHideDuration: 3000, action })
                        console.error(error)
                    }
                }

                notifyCallEnded()

                await archiveCall()
            }

            if (!simpleCleanUp && (activeRoomData?.roomId || rejectCall || active)) {
                console.warn("firebase room removed")

                // TODO: MAKE THIS A BATCH CALL SAVE COST !!
                await Promise.all([
                    deleteDoc(doc(COL_REF_CALLER_HAS_ROOM, callerAddress)),
                    deleteDoc(doc(getColRefActive(calleeAddress), callerAddress)),
                ])

                // await deleteDoc(doc(COL_REF_CALLER_HAS_ROOM, callerAddress))
                // await deleteDoc(doc(getColRefActive(calleeAddress), callerAddress));
            }

            setActiveCallMaxSeconds("0")
            setFlowDeposit(null)
            setIsCallee(false)
            setIsCaller(false)
            setOtherAddress(PLACEHOLDER_ADDRESS)
            setTheCalleeAddress(PLACEHOLDER_ADDRESS)
            setTheCallerAddress(PLACEHOLDER_ADDRESS)
            setIsCallerInCall(false)

            if (active) {
                navigate(location.state?.from?.pathname || '/', { replace: true }) //
            }
        } catch (error) {
            console.error(error)
        }

        logEvent(analytics, "call_cleared")
        console.log("call cleared")
        setIsEnding(false)
    }

    const endPendingCallFromCaller = async () => {
        if (!activeRoomData?.callee && isCaller) { // only for precall (pending call), but triggers on active call as well (ignore this side effect)
            console.log("clear call - PENDING - endPendingCallFromCaller")
            await cleanUp(otherAddress, localAddress, false, "timeout", true)
            clearPendingCall()
        }

        // if (localUserData?.isActive) { // extra functionality newly added (not related to parent fn name)

        // }
        await updateLocalInCallActivity(localAddress, false)
    }

    const endActiveCallFromCaller = async () => {
        if (otherAddress !== PLACEHOLDER_ADDRESS && otherAddress !== localAddress) {
            console.log("clear call - ACTIVE - endActiveCallFromCaller")
            await cleanUp(otherAddress, localAddress, true, "out of funds")
            clearActiveCallBatch()
        }
    }

    const endActiveCallFromCallee = async () => {
        if (otherAddress !== PLACEHOLDER_ADDRESS && otherAddress !== localAddress) {
            console.log("clear call - ACTIVE - endActiveCallFromCallee")
            await cleanUp(localAddress, otherAddress, true, "")
            clearActiveCallBatch()
        }
    }

    const useReferral = async () => { // applies to both caller & callee
        const docRef = doc(COL_REF_REFERRALS, localAddress);
        const docSnap = await getDoc(docRef);



        if (docSnap.exists()) {
            const data = docSnap.data()
            console.warn("REFERRER ADDRESS:", data.referrerAddress)
            // const batch = writeBatch(db) // firestore rules contradicts

            // batch.set(doc(COL_REF_PROMO1, data.referrerAddress), { count: increment(PROMO1_COUNT) }, { merge: true })
            // batch.delete(docRef)

            try {
                setDoc(doc(COL_REF_PROMO1, data.referrerAddress), { count: increment(PROMO1_COUNT) }, { merge: true })
            } catch (error) {
                console.error("Setting promo:", error)
            }

            deleteDoc(docRef)
        } else {
            console.warn("No referrer to register");
        }

        // TODO: check if got firestore referral field value, if so, 
        // 1. DELETE it 
        // 2. add in firestore, "promo1" collection | promo1 => <referrer's address> => {count: +1}
    }

    const clearActiveCallBatch = () => {
        console.warn("LiveThree: batch timers cleared")
        clearActiveCall()
        clearReferralCall()
    }

    const [isCallPending, clearPendingCall, resetPendingCall] = useTimeoutFn(endPendingCallFromCaller, CALL_PENDING_EXPIRE_IN_MS)
    const [isCallActive, clearActiveCall, resetActiveCall] = useTimeoutFn(endActiveCallFromCaller, Number(activeCallMaxSeconds) * 1000) // TODO: caution for BigNumber | * 1000 to convert to MS
    const [isReferralCall, clearReferralCall, resetReferralCall] = useTimeoutFn(useReferral, REFERRAL_MIN_DURATION_S * 1000)

    useEffectOnce(() => {
        clearPendingCall()
        clearActiveCallBatch()
    })

    const clearEventListener = () => {
        window.removeEventListener('beforeunload', endPendingCallFromCaller)
        // window.removeEventListener('unload', endPendingCallFromCaller)
        window.removeEventListener('popstate', endPendingCallFromCaller)

        console.warn("event listener cleared")
    }

    // ----- 1. initiate call - caller creates room, on standby----- //
    const initiateCall = async (calleeAddress: any) => {
        setIsInitiating(true)

        setErrorCreatingFlow(null)
        setErrorDeletingFlow(null)

        try {
            const roomDetails: any = await createRoom()
            const roomId = roomDetails?.data.id
            const token = await fetchToken({ roomId: roomId, userId: localAddress, role: ROLE_CALLER })

            await setDoc(doc(getColRefActive(calleeAddress), localAddress), { // TODO: save these data locally?
                roomId: roomId,
                caller: localAddress,
                callerToken: token?.data,
                callerDisplayName: localUserData?.handle || localAddress || "error_loading_name",
                callerPicture: localUserData?.photoURL,
                callerUid: localAddress,
                callerChainId: chainId,
                callStartTimestamp: Date.now(),
            })

            await setDoc(doc(COL_REF_CALLER_HAS_ROOM, localAddress), {
                hasRoom: true,
            })

            setOtherAddress(calleeAddress)
            setIsCaller(true)
            resetPendingCall()
        } catch (error) {
            console.error(error)
        }

        setIsInitiating(false)
    }

    // ----- 2. accept call - callee joins room ----- //
    const acceptCall = async (callerAddress: any, roomId: any) => {
        setIsEntering(true)

        setIsRinging(false)
        stop()

        setErrorCreatingFlow(null)
        setErrorDeletingFlow(null)

        try {
            const token = await fetchToken({ roomId: roomId, userId: localAddress, role: ROLE_CALLEE })
            const tokenData: any = token?.data

            await updateDoc(doc(getColRefActive(localAddress), callerAddress), {// TODO: save these data locally?
                callee: localAddress,
                calleeToken: tokenData,
                calleeDisplayName: localUserData?.handle || localAddress || "error_loading_name",
                calleeUid: localAddress,
                flowRate: localUserData?.flowRate,
            })

            hmsActions.join({
                userName: localUserData?.handle || localAddress || "error_loading_name",
                authToken: tokenData,
                rememberDeviceSelection: true
            });

            setOtherAddress(callerAddress)
            setIsCallee(true)

            clearEventListener()

            navigate(`/call/${ callerAddress }/${ localAddress }/${ localUserData?.flowRate }`, {
                state: {
                    from: location,
                }
            })
        } catch (error) {
            console.error(error)
        }
    }

    // ----- 3. start call - caller joins room ----- //
    useUpdateEffect(() => {
        if (activeRoomData?.caller === localAddress && activeRoomData?.callee === otherAddress && activeRoomData?.calleeToken) {
            setIsEntering(true)
            hmsActions.join({
                userName: localUserData?.handle || localAddress || "error_loading_name",
                authToken: activeRoomData?.callerToken,
                rememberDeviceSelection: true
            });
            setIsCallerInCall(true)
            clearPendingCall()

            clearEventListener()

            navigate(`/call/${ localAddress }/${ otherAddress }/${ activeRoomData?.flowRate }`, {
                state: {
                    from: location,
                }
            })
        }
    }, [activeRoomData?.callee])

    useUpdateEffect(() => {
        const callerCleanUp = async () => {
            console.log("clear call - PENDING - callerCleanUp")
            await cleanUp(otherAddress, localAddress, false, "callee cancelled")
            clearPendingCall()
        }

        if (!activeRoomData?.caller && otherAddress && otherAddress !== PLACEHOLDER_ADDRESS && isCaller) {
            console.warn(`clean up from caller side (stop pending timer) if callee reject call`) // may run as side effect of other operations
            callerCleanUp()
        }
    }, [activeRoomData?.caller])

    useEffect(() => {
        window.addEventListener('beforeunload', endPendingCallFromCaller) // https://developer.mozilla.org/en-US/docs/Web/API/Window#load_unload_events
        // window.addEventListener('unload', endPendingCallFromCaller)
        window.addEventListener('popstate', endPendingCallFromCaller) // TODO: does NOT fire properly, esp when on first load, then call immediately then back
        return () => {
            clearEventListener()
        }
    }, [otherAddress])

    // useEffect(() => { // this block doesn't really work (use when PEER_LEFT block instead)
    //     window.addEventListener('beforeunload', endActiveCallFromCaller) // https://developer.mozilla.org/en-US/docs/Web/API/Window#load_unload_events
    //     window.addEventListener('popstate', endActiveCallFromCaller) // TODO: does NOT fire properly, esp when on first load, then call immediately then back

    //     return () => {
    //         window.removeEventListener('beforeunload', endActiveCallFromCaller)
    //         window.removeEventListener('popstate', endActiveCallFromCaller)
    //     }
    // }, [isConnectedToRoom, activeRoomData?.callee])

    const archiveCall = async () => { // TODO: call from 1 side only to NOT double save - from side that end call
        try {
            // set caller history
            await setDoc(doc(getColRefHistoryKey(activeRoomData?.caller), activeRoomData?.roomId),
                { caller: activeRoomData?.caller, callee: activeRoomData?.callee, timestamp: serverTimestamp() }
            )
            // set callee history
            await setDoc(doc(getColRefHistoryKey(activeRoomData?.callee), activeRoomData?.roomId),
                { caller: activeRoomData?.caller, callee: activeRoomData?.callee, timestamp: serverTimestamp() }
            )
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        const startSFStream = async () => {
            try {
                await createFlow(activeRoomData?.callee, activeRoomData?.flowRate)
            } catch (error: any) {
                enqueueSnackbar("Something went wrong! - Create flow", { variant: 'error', autoHideDuration: 3000, action })
                console.error(error)
            }
        }
        if (
            peerCount >= 2
            && activeRoomData?.caller === localAddress
            && otherAddress
            && otherAddress !== PLACEHOLDER_ADDRESS
            && !isTransactionPending
        ) { // note: only caller can turn tap on, many checks
            startSFStream() // TODO: TMP
            return
        }
    }, [peerCount]) // TODO: make sure video visible first / at same time, check (localPeer && remotePeers[0] or peerCount)

    useUpdateEffect(() => {
        const cleanUpOnCallerEndCallProperly = async () => {
            await cleanUp(otherAddress, localAddress, false, "simple clean up", false, true)
        }
        if (hmsNotification?.type === HMSNotificationTypes.ROOM_ENDED) { // other party ends room
            clearActiveCallBatch()
            setIsEnding(true)
            notifyCallEnded()
            cleanUpOnCallerEndCallProperly()
            setTimeout(() => {
                navigate(location.state?.from?.pathname || '/', { replace: true })
                setIsEnding(false)
            }, 5000) // why timeout? so that on party that did on end side, it wont show the "incoming call" that has actually just ended

        }

        if (hmsNotification?.type === HMSNotificationTypes.PEER_LEFT) {
            console.warn("PEER LEFT!!!!")
            if (isCaller) {
                endActiveCallFromCaller()
            } else if (isCallee) {
                endActiveCallFromCallee()
            } else {
                // console.log("no isCaller/isCallee")
            }
        }
    }, [hmsNotification])

    const getAvailableSeconds = async (flowRate: string) => {
        const tokenXBalanceAfterDeposit = ethers.BigNumber.from(await getTokenXBalance(activeRoomData?.caller)) // note: this is AFTER minus deposit

        const totalSeconds = tokenXBalanceAfterDeposit?.div(ethers.BigNumber.from(flowRate))

        const safeSeconds = totalSeconds?.sub(ethers.BigNumber.from(END_CALL_BUFFER_SECONDS))
        setActiveCallMaxSeconds(safeSeconds.toString()) // set for caller
    }

    const setActiveFlow = async () => {
        console.warn("~~~ Checking active flow ~~~")
        const flowInfo = await getFlowData(activeRoomData?.caller, activeRoomData?.callee)
        const flowInfoAdmin = await getFlowData(activeRoomData?.caller, ADMIN_ADDRESS)

        const flowRateEffective = flowInfo?.flowRate.add(flowInfoAdmin?.flowRate)
        const flowDepositEffective = flowInfo?.deposit.add(flowInfoAdmin?.deposit)

        const flowRate = flowRateEffective.toString()
        const flowDeposit = flowDepositEffective.toString()

        setEffectiveFlowRate(flowRate)
        setEffectiveFlowDeposit(flowDeposit)
    }

    useInterval(() => {
        setActiveFlow()
    }, ((effectiveFlowRate === "0" || effectiveFlowDeposit === "0") && isCheckFlow && activeCallMaxSeconds === "0" && activeRoomData?.caller === localAddress) ? 2000 : null)

    useUpdateEffect(() => {
        const getInfo = async () => {

            if (effectiveFlowRate !== "0" && effectiveFlowDeposit !== "0" && activeRoomData?.caller === localAddress) { // caller
                await getAvailableSeconds(effectiveFlowRate)

                setFlowDeposit(effectiveFlowDeposit)
                setEffectiveFlowRate("0")
                setEffectiveFlowDeposit("0")
                setIsCheckFlow(false)
            }
        }
        if (activeRoomData) {
            setIsCheckFlow(true)
            getInfo()
        }
    }, [isCreatingFlow, activeRoomData?.flowRate, effectiveFlowRate, effectiveFlowDeposit])

    useUpdateEffect(() => {
        if (activeCallMaxSeconds !== "0" && activeRoomData?.caller === localAddress) {
            console.warn("LiveThree: End active call timer begins", activeCallMaxSeconds)
            resetActiveCall()
            resetReferralCall()
        }

        const setMaxSeconds = async () => {
            console.warn("UPDATE max seconds!", activeCallMaxSeconds)
            await updateDoc(doc(getColRefActive(otherAddress), localAddress), {// TODO: save these data locally?
                maxSeconds: activeCallMaxSeconds
            })
        }
        if (activeRoomData?.caller === localAddress && activeCallMaxSeconds !== "0") {
            console.log("setting max seconds")
            setMaxSeconds()
        }

    }, [activeCallMaxSeconds])

    useUpdateEffect(() => {
        if (activeRoomData?.maxSeconds && activeRoomData?.callee === localAddress) {
            setActiveCallMaxSeconds(activeRoomData?.maxSeconds) // set for callee
            resetReferralCall()
        }
    }, [activeRoomData?.maxSeconds])

    useEffect(() => {
        console.log("isDeletingFlow:", isDeletingFlow)
    }, [isDeletingFlow])

    useUpdateEffect(() => {
        const cleanUpOnFlowError = async (active: boolean) => { // TODO: test
            await cleanUp(otherAddress, localAddress, false, "flow operation failed")
            notifyCallEnded()

            // TODO: this navigate line have bug, where if delete flow from 
            // settings page will navigate to previous (although navigate should
            // only really apply to end active call)
            navigate(location.state?.from?.pathname || '/', { replace: true })

            clearPendingCall()
            clearActiveCallBatch()

            setErrorCreatingFlow(null)
            setErrorDeletingFlow(null)
        }

        if (hmsNotification) {
            console.log("hms notify type:", hmsNotification.type)
        }
        if (createRoomError) {
            console.error("create room error", createRoomError)
        }
        if (fetchTokenError) {
            console.error("fetch token error", fetchTokenError)
        }
        if (errorCreatingFlow) { // only applicable from caller side
            console.error("create flow error", errorCreatingFlow)
            cleanUpOnFlowError(false)
        }
        if (errorDeletingFlow) { // TODO: keep repeat until success?
            console.error("delete flow error", errorDeletingFlow)
            cleanUpOnFlowError(true)
        }
    }, [hmsNotification, createRoomError, fetchTokenError, errorCreatingFlow, errorDeletingFlow])


    const contextProvider = {
        isInitiating,
        isEntering,
        isEnding,
        activeCallMaxSeconds,
        flowDeposit,
        isRingtoneEnabled,
        isCalleeInCall,
        hasRoom,
        historyData,
        isCaller,
        setIsEntering,
        initiateCall,
        acceptCall,
        cleanUp,
        clearPendingCall,
        clearActiveCallBatch,
        setIsRingtoneEnabled,
    }
    return (
        <CallContext.Provider value={ contextProvider }>
            { children }
        </CallContext.Provider>
    )
}
