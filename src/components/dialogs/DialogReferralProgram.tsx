import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Avatar from '@mui/material/Avatar';
import InfoIcon from '@mui/icons-material/Info';

import { ButtonCopy } from '../buttons/ButtonCopy';

import { useWeb3Auth } from '../../contexts/Web3Auth';
import { useTheme } from '@mui/material/styles';

import {
    PERCENTAGE_TAKE_NUMERATOR, PERCENTAGE_TAKE_NUMERATOR_PROMO1,
    PROMO1_COUNT, REFERRAL_MIN_DURATION_S
} from '../../constants/constants';

export const DialogReferralProgram = ({ open, setOpen, count }: any) => {
    const { address: localAddress } = useWeb3Auth()
    const theme = useTheme()

    return (
        <Dialog
            disableEscapeKeyDown
            open={ open }
            onClose={ () => {
                setOpen(false)

            } }
            sx={ {
                "& .MuiDialog-container": {
                    "& .MuiPaper-root": {
                        width: "100%",
                        maxWidth: "900px",  // Set your width here
                    },
                },
            } }
        >
            <DialogTitle>
                { "Refer a friend" }
            </DialogTitle>
            <DialogContent>
                <DialogContentText align="justify">
                    You will earn a <Box component="span" fontWeight='fontWeightMedium' display='inline'>{ ((PERCENTAGE_TAKE_NUMERATOR - PERCENTAGE_TAKE_NUMERATOR_PROMO1) * 100) / PERCENTAGE_TAKE_NUMERATOR }% reduction </Box>
                    in LiveThree percentage take (<Typography sx={ { textDecoration: "line-through" } } display='inline'>{ PERCENTAGE_TAKE_NUMERATOR }%</Typography> { PERCENTAGE_TAKE_NUMERATOR_PROMO1 }%) for the next
                    <Box component="span" fontWeight='fontWeightMedium' display='inline'> { PROMO1_COUNT } call(s) </Box>
                    for <Box component="span" fontWeight='fontWeightMedium' display='inline'>every </Box>
                    referee who signs up and makes or receives a money streaming video call for at least { REFERRAL_MIN_DURATION_S + 5 } seconds
                    through your referral link.
                    <Tooltip title="Up to a maximum of 100 calls">
                        <Avatar
                            sx={ { bgcolor: theme.palette.secondary.main, width: 16, height: 16, ml: 1 } }
                        >
                            <InfoIcon sx={ { width: "80%", height: "80%" } } />
                        </Avatar>
                    </Tooltip>
                </DialogContentText>

                <Box sx={ { p: 1 } }></Box>
                <DialogContentText align="justify">
                    Referral link:
                </DialogContentText>
                <Stack
                    direction='row'
                    alignItems='center'
                    justifyContent='align-left'
                >
                    <DialogContentText sx={ { textDecoration: "underline" } }>
                        { window.location.origin }/sign-in/{ localAddress }
                    </DialogContentText>
                    <ButtonCopy value={ `${ window.location.origin }/sign-in/${ localAddress }` } msg={ 'Referral link' } />
                </Stack>
                <Box sx={ { p: 1 } }></Box>
                { count > 0 &&
                    <DialogContentText align="justify">
                        You currently have { count } discounted money streaming video call(s) remaining.
                    </DialogContentText>
                }
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={ () => {
                        setOpen(false)
                    } }
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
