import { useState } from 'react';

import Fab from '@mui/material/Fab';
import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import BugReportIcon from '@mui/icons-material/BugReport';

import { useResponsive } from '../hooks/useResponsive';

import { useWeb3Auth } from '../contexts/Web3Auth';
import { useSuperfluidGas } from '../contexts/SuperfluidGas';

import {
    WEB3AUTH_CHAIN_CONFIG_TYPE, CHAIN_NAME_DEFAULT,
    CHAIN_NAME_POLYGON, CHAIN_NAME_MUMBAI
} from '../constants/constants';

export const Debugger = () => {
    const isMobile = useResponsive('down', 'sm');

    const [openWallet, setOpenWallet] = useState<boolean>(false)
    const [openNetwork, setOpenNetwork] = useState<boolean>(false)
    const [network, setNetwork] = useState<WEB3AUTH_CHAIN_CONFIG_TYPE>(CHAIN_NAME_DEFAULT)

    const { getOperatorData, getNetFlowAdminTokenXTmp, getNetFlowTokenX, createFlow, tokenAllowance, refreshSFStates, getFlowData } = useSuperfluidGas()
    const { chainId, getUserInfo, setSelectedChain, setIsLoginReady } = useWeb3Auth()

    const [recipientAddress, setRecipientAddress] = useState<string>("")
    const [amountWei, setAmountWei] = useState<string>("")


    return (
        <Box
            sx={ isMobile ? {
                position: "fixed",
                bottom: (theme) => theme.spacing(8),
                right: (theme) => theme.spacing(12)
            } : {
                position: "fixed",
                bottom: (theme) => theme.spacing(3),
                right: (theme) => theme.spacing(58)
            } }
        >
            <Fab
                color="primary"
                onClick={ () => {
                    setRecipientAddress("")
                    setAmountWei("")
                    setOpenWallet(!openWallet)
                } }
            >
                <BugReportIcon />
            </Fab>
            <Modal
                open={ openWallet }
                onClose={ () => {
                    setOpenWallet(false)
                } }
            >
                <Box sx={ {
                    position: 'absolute' as 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 350,
                    bgcolor: 'background.paper',
                    border: '2px solid #000',
                    boxShadow: 24,
                    p: 4,
                } }>
                    <Stack spacing={ 3 }>
                        <Typography>Developer Tools</Typography>
                        <FormControl fullWidth>
                            <InputLabel id="select-network">Network</InputLabel>
                            <Select
                                open={ openNetwork }
                                onClose={ () => {
                                    setOpenNetwork(false)
                                } }
                                onOpen={ () => {
                                    setOpenNetwork(true)
                                } }
                                value={ network }
                                labelId="select-network"
                                label="Network"
                                onChange={ (event: any) => {
                                    const value = event.target.value
                                    setSelectedChain(value)
                                    setNetwork(value)
                                    setIsLoginReady(true)
                                } }
                            >
                                <MenuItem value={ CHAIN_NAME_POLYGON }>Polygon Mainnet</MenuItem>
                                <MenuItem value={ CHAIN_NAME_MUMBAI }>Polygon Mumbai</MenuItem>
                            </Select>
                        </FormControl>
                        <Stack spacing={ 1 } sx={ { width: "100%" } }>
                            <TextField
                                fullWidth
                                label="create flow recipient address"
                                value={ recipientAddress }
                                onChange={ (event) => {
                                    const value = event.target.value
                                    setRecipientAddress(value)
                                } }
                            />
                            <TextField
                                fullWidth
                                label="amount wei"
                                type="number"
                                value={ amountWei }
                                onChange={ (event) => {
                                    const value = event.target.value
                                    setAmountWei(value)
                                } }
                                helperText="10000000000000 wei (0.00001 ether)"
                            />
                            <Button
                                variant="contained"
                                disabled={ recipientAddress === "" || amountWei === "" }
                                onClick={ async () => {
                                    await createFlow(recipientAddress, amountWei)
                                    setRecipientAddress("")
                                    setAmountWei("")
                                } }
                            >
                                createFlow
                            </Button>
                        </Stack>
                        <Button
                            variant="contained"
                            onClick={ async () => {
                                const operatorInfo = await getOperatorData()
                                console.log("permission:", operatorInfo.permissions)
                            } }
                        >
                            getOperatorData
                        </Button>
                        <Button
                            variant="contained"
                            onClick={ async () => {
                                console.log((await getNetFlowTokenX()).toString())
                            } }
                        >
                            getNetFlowTokenX
                        </Button>
                        <Button
                            variant="contained"
                            onClick={ async () => {
                                console.log((await getFlowData("0xab9bbc59359e70EBdfAB5941bc8546E65BBe02da", "0xed9F34A7A6117b303F2aFB8E4b792088D79Aa8BC")).toString())
                            } }
                        >
                            getFlow!!
                        </Button>
                        <Button
                            variant="contained"
                            onClick={ async () => {
                                const netFlow = await getNetFlowAdminTokenXTmp()
                                console.log(netFlow.toString())
                            } }
                        >
                            check admin flow
                        </Button>
                        <Button
                            variant="contained"
                            onClick={ async () => {
                                console.log(await getUserInfo())
                            } }
                        >
                            web3authUser
                        </Button>
                        <Button
                            onClick={ () => {
                                refreshSFStates()
                                console.log(tokenAllowance)
                            } }
                        >
                            allowance
                        </Button>
                        {/* <Button
                            onClick={ async () => {
                                const data = {
                                    chainId: "333",
                                    tokenXAddress: "the address ok",
                                    sender: "caller address",
                                    receiver: "callee address",
                                }
                                const resp = await axios.post("https://us-central1-moonlight-173df.cloudfunctions.net/turnTapOffHttp", data)
                                console.log(resp)

                            } }
                        >
                            test https
                        </Button> */}
                    </Stack>
                </Box>
            </Modal >
        </Box >
    )
}
