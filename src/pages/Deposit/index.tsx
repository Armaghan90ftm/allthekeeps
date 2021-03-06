import {gql, useQuery, useSubscription} from "@apollo/client";
import React, {useState} from "react";
import {useParams} from 'react-router';
import {getSatoshisAsBitcoin} from "../../utils/getSatoshisAsBitcoin";
import {TimeToNow} from "../../components/FormattedTime";
import {css} from "emotion";
import {Address, BitcoinAddress} from "../../components/Address";
import {Paper} from "../../design-system/Paper";
import {NiceStateLabel} from "../../utils/depositStates";
import {
  getTDTTokenAddress,
  getVendingMachineAddress,
  hasDepositBeenUsedToMint,
  isVendingMachine,
} from "../../utils/contracts";
import {InfoTooltip} from "../../components/InfoTooltip";
import {Helmet} from "react-helmet";
import {getWeiAsEth} from "../../utils/getWeiAsEth";
import {CollaterizationStatus} from "../../components/CollateralizationStatus";
import {Box} from "../../components/Box";
import {Button} from "../../design-system/Button";
import {Log} from "./log";
import {useDAppDomain, useEtherscanDomain} from "../../NetworkContext";
import {useBtcAddressFromPublicKey} from "../../utils/useBtcAddressFromPublicKey";
import {StatusBox} from "./StatusBox";


const DEPOSIT_QUERY = gql`
    query GetDeposit($id: ID!) {
        deposit(id: $id) {
            id,
            contractAddress,
            currentState,
            createdAt,
            keepAddress,
            lotSizeSatoshis,
            endOfTerm,
            
            tdtToken {
                id,
                tokenID,
                owner,
                minter
            }

            initialCollateralizedPercent,
            undercollateralizedThresholdPercent,
            severelyUndercollateralizedThresholdPercent,
            
            bondedECDSAKeep {
                id,
                keepAddress,
                totalBondAmount,
                publicKey,
                status,
                honestThreshold,
                members {
                    id,
                    address
                }
            },
            
            depositLiquidation {
                cause
            }
            
            ...NiceStateLabel
        }
    }
  
    ${NiceStateLabel}
`;

const DEPOSIT_SUBSCRIPTION = gql`
    subscription WatchDeposit($id: ID!) {
        deposit(id: $id) {
            id
            currentState
        }
    }
`;

const formatter = new Intl.NumberFormat("en-US", {
  style: 'percent',
  maximumFractionDigits: 2
});


export function Deposit() {
  return <div className={css`
      padding: 1em;
    `}>
    <Helmet>
      <title>Deposit</title>
    </Helmet>
    <Content />
  </div>
}


export function Content() {
  let { depositId } = useParams<any>();
  const { loading, error, data } = useQuery(DEPOSIT_QUERY, {variables: {id: depositId}});
  useSubscription(DEPOSIT_SUBSCRIPTION, { variables: { id: depositId } });
  const etherscan = useEtherscanDomain();
  const dAppDomain = useDAppDomain();

  const btcAddress = useBtcAddressFromPublicKey(data?.deposit.bondedECDSAKeep.publicKey);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :( {""+ error}</p>;

  const canBeRedeemed = ['ACTIVE', 'COURTESY_CALL'].indexOf(data.deposit.currentState) > -1;
  const isAtTerm = false;  // XXX still needs to be fixed
  const canBeRedeemedByAnyone = canBeRedeemed && (data.deposit.currentState == 'COURTESY_CALL' || isAtTerm || isVendingMachine(data.deposit.tdtToken.owner));

  return <div>
    <div className={css`
      display: flex;
      flex-direction: row;
      & > * {
        margin-right: 20px;
      }
  `}>
      <Box label={"lot size"}>
        {getSatoshisAsBitcoin(data.deposit.lotSizeSatoshis)} BTC
      </Box>

      <StatusBox deposit={data.deposit} />

      <Box label={"creation date"}>
        <TimeToNow time={data.deposit.createdAt} />
      </Box>
    </div>

    <div style={{
      display: "flex",
      flexDirection: "row",
      marginTop: '20px'
    }}>
      <div style={{marginRight: '20px', flex: 1}}>
        <Paper padding>
          <div className={css`
            font-weight: bold;
            margin-bottom: 0.5em;
          `}>
            Ownership <InfoTooltip>
              For every deposit, a non-fungible TDT Token is minted. Whoever owns this token, owns the deposit.
            </InfoTooltip>
          </div>
          <div className={css`
          `}>
            {
              hasDepositBeenUsedToMint(data.deposit.tdtToken.owner, data.deposit.currentState)
                  ? <div>
                    This deposit has been used to mint tBTC. The corresponding TDT token is now
                    owned by the <a href={`https://${etherscan}/address/${getVendingMachineAddress()}`}>Vending Machine contract</a>.
                  </div>
                  : (data.deposit.tdtToken.owner == data.deposit.tdtToken.minter) ? <div>
                    The TDT Token representing ownership over this deposit is owned by the original
                    deposit creator, <Address address={data.deposit.tdtToken.owner} />.
                  </div> : <div>
                    The TDT Token representing ownership over this deposit is owned by <Address address={data.deposit.tdtToken.owner} />.
                  </div>
            }
          </div>
          <div className={css`
            font-size: 0.8em;
            margin-top: 10px;
            & a, a:visited {
              color: gray;
            }            
          `}>
            <a href={`https://${etherscan}/token/${getTDTTokenAddress()}?a=${data.deposit.tdtToken.tokenID}`}>TDT Token on Etherscan</a>
          </div>

          {(canBeRedeemedByAnyone) ?
            <div style={{marginTop: 20}}>
              This deposit can be redeemed by anyone, even non-owners. <InfoTooltip>Because it is owned by the Vending Machine, has been courtesy called, or is at-term, anyone can exchange tBTC for the Bitcoin deposited here.</InfoTooltip>
              <div style={{marginTop: '8px'}}><Button size={"small"} to={`https://${dAppDomain}/deposit/${data.deposit.contractAddress}/redeem`}>
                Redeem
              </Button></div>
            </div>
          : null }
        </Paper>

        <div style={{marginTop: '20px'}}>
          <Paper>
            <PropertyTable
                data={[
                  {
                    key: 'tokenOwner',
                    label: "Current Owner",
                    tooltip: "Deposit owner as represented by ownership over the TDT token.",
                    value: <Address address={data.deposit.tdtToken.owner} />
                  },
                  {
                    key: 'tokenMinter',
                    label: "Creator",
                    tooltip: "Original creator of this deposit.",
                    value: <Address address={data.deposit.tdtToken.minter}  />
                  },
                  {
                    key: 'tokenId',
                    label: "Token ID",
                    value: <Address address={data.deposit.tdtToken.tokenID} to={`https://${etherscan}/token/${getTDTTokenAddress()}?a=${data.deposit.tdtToken.tokenID}`}  />
                  },
                  data.deposit.endOfTerm ? {
                    key: 'endOfTerm',
                    label: "End Of Term",
                    tooltip: "Within the term, only the owner can redeem the deposit or mint tBTC.",
                    value: <TimeToNow time={data.deposit.endOfTerm} />
                  } : undefined,
                  {
                    key: 'depositContract',
                    label: "Deposit Contract",
                    value: <Address address={data.deposit.contractAddress}  />
                  }
                ]}
            />
          </Paper>
        </div>
      </div>

      <div style={{flex: 1}}>
        <Paper>
          <div className={css`
            font-weight: bold;
            padding: 20px;
            padding-bottom: 0;
          `}>
            Keep <InfoTooltip>
              The Keep holds the original BTC in custody, and signers stake ETH as a security bond.
            </InfoTooltip>
          </div>
          <PropertyTable data={[
            {
              key: 'signers',
              label: "Signers",
              tooltip: "The node operators collectively holding the Bitcoin private key",
              value: <div>
                {data.deposit.bondedECDSAKeep.members.map((m: any) => {
                  return <div key={m.address}>
                    <Address address={m.address} to={`/operator/${m.address}`} />
                  </div>
                })}
              </div>
            },
            {
              key: 'bondedAmount',
              label: "Bond",
              tooltip: "The total value the signers have bonded to guarantee this deposit.",
              value: <span>{getWeiAsEth(data.deposit.bondedECDSAKeep.totalBondAmount).toFixed(2)} ETH</span>
            },
            {
              key: 'collateralization',
              label: "Collaterialization",
              tooltip: "If ETH loses value, the keep may become undercollaterized",
              value: <CollaterizationStatus deposit={data.deposit} highlightNormal={true} style={{fontWeight: 'bold'}} />
            },
            {
              key: 'thresholds',
              label: "Thresholds",
              tooltip: "The collateralization requirements for this deposit: Initial / Courtesy Call / Liquidation",
              value: <span>
                {formatter.format(data.deposit.initialCollateralizedPercent / 100)}<span style={{color: 'silver'}}> / </span>{formatter.format(data.deposit.undercollateralizedThresholdPercent / 100)}<span style={{color: 'silver'}}> / </span>{formatter.format(data.deposit.severelyUndercollateralizedThresholdPercent / 100)}
              </span>
            },
            {
              key: 'honestThreshold',
              label: "Honest Threshold",
              tooltip: "How many signers must be honest for the bond not be lost.",
              value: <span>{formatter.format(data.deposit.bondedECDSAKeep.honestThreshold / data.deposit.bondedECDSAKeep.members.length)}</span>
            },
            {
              key: 'keepAddress',
              label: "Contract Address",
              tooltip: "The contract managing the keep",
              value: <Address address={data.deposit.keepAddress} />
            },
            btcAddress ? {
              key: 'publicKey',
              label: "BTC Address",
              value: <BitcoinAddress address={btcAddress} />
            } : undefined,
            {
              key: 'status',
              label: "Status",
              value: data.deposit.bondedECDSAKeep.status
            }
          ]} />
        </Paper>
      </div>
    </div>

    <Paper>
      <div className={css`           
        padding: 20px;
      `}>
        <h3 style={{marginTop: 0}}>Log</h3>
        <Log depositId={data.deposit.id} />
      </div>
    </Paper>
  </div>
}



function PropertyTable(props: {
  data: (undefined|{
    key: string,
    label: string,
    tooltip?: string,
    value: any
  })[]
}) {
  return <table className={css`
      color: #0A0806;
      padding: 15px;
      
      & td, th {
        font-weight: normal;
        padding: 5px;
        text-align: left;
        vertical-align: top;
      }
    `}>
      <tbody>
      {props.data.map(row => {
        if (!row) { return null; }
        return <tr key={row.key}>
          <th>
            {row.label} {row.tooltip ? <InfoTooltip>{row.tooltip}</InfoTooltip> : null}
          </th>
          <td>{row.value}</td>
        </tr>
      })}
      </tbody>
    </table>
}
