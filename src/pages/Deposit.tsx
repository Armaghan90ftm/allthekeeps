import {gql, useQuery} from "@apollo/client";
import React from "react";
import {useParams} from 'react-router';
import { Link } from "react-router-dom";
import {getSatoshisAsBitcoin} from "../utils/getSatoshisAsBitcoin";
import {FormattedTime} from "../components/FormattedTime";
import {css} from "emotion";
import {Address} from "../components/Address";
import { Paper } from "../design-system/Paper";
import {getNiceStateLabel, getStateTooltip} from "../utils/depositStates";
import {
  getTDTTokenAddress,
  getVendingMachineAddress,
  hasDepositBeenUsedToMint,
  isVendingMachine
} from "../utils/contracts";
import {InfoTooltip} from "../components/InfoTooltip";
import {TBTCIcon} from "../design-system/tbtcIcon";


const DEPOSIT_QUERY = gql`
    query GetDeposit($id: String!) {
        deposit(id: $id) {
            id,
            contractAddress,
            currentState,
            createdAt,
            keepAddress,
            lotSizeSatoshis,

            tbtcSystem,
            tdtToken {
                id,
                owner,
                minter
            }

            initialCollateralizedPercent,
            collateralizationPercent,
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
            }
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
    <Content />
  </div>
}

export function Content() {
  let { depositId } = useParams<any>();
  const { loading, error, data } = useQuery(DEPOSIT_QUERY, {variables: {id: depositId}});

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :( {""+ error}</p>;

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

      <Box label={"state"}>
        <div>
          {getNiceStateLabel(data.deposit.currentState)} {getStateTooltip(data.deposit.currentState)
            ? <span className={css`position: relative; top: -0.5em; font-size: 0.6em;`}><InfoTooltip>{getStateTooltip(data.deposit.currentState)}</InfoTooltip></span>
            : null}
        </div>
        {
          hasDepositBeenUsedToMint(data.deposit.tdtToken.owner, data.deposit.currentState)
              ? <div className={css`
                  font-size: 0.6em;
                  display: flex;
                  flex-direction: row;
                  align-items: center;
              ` }>
                <TBTCIcon /> <span style={{paddingLeft: 5}}>tBTC minted</span>
                </div>
              : null
        }
      </Box>

      <Box label={"creation date"}>
        <FormattedTime time={data.deposit.createdAt} />
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
                    This deposit has been used to mint <strong>tBTC</strong>. The corresponding TDT token is now
                    owned by the <a href={`https://etherscan.io/address/${getVendingMachineAddress()}`}>Vending Machine contract</a>.
                  </div>
                  : <div>
                    The TDT Token representing ownership over this deposit is owned by the original
                    deposit creator, <a href={`https://etherscan.io/address/${data.deposit.tdtToken.owner}`}>{data.deposit.tdtToken.owner}</a>.
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
            <a href={`https://etherscan.io/token/${getTDTTokenAddress()}?a=${data.deposit.tdtToken.id}`}>TDT Token on Etherscan</a>
          </div>
        </Paper>

        <div style={{marginTop: '20px'}}>
          <Paper>
            <PropertyTable
                data={[
                  {
                    key: 'tokenOwner',
                    label: "Current Owner",
                    tooltip: "Deposit owner as represented by ownership over the TDT token",
                    value: <Address address={data.deposit.tdtToken.owner} />
                  },
                  {
                    key: 'tokenMinter',
                    label: "Creator",
                    tooltip: "Original creator of this deposit",
                    value: <Address address={data.deposit.tdtToken.minter}  />
                  },
                  {
                    key: 'depositContract',
                    label: "Deposit Contract",
                    value: <Address address={data.deposit.contractAddress}  />
                  },
                  {
                    key: 'tbtcSystem',
                    label: "tBTC contract",
                    value: <Address address={data.deposit.tbtcSystem} />
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
                  return <div>
                    <Address address={m.address} to={`/operator/${m.address}`} />
                  </div>
                })}
              </div>
            },
            {
              key: 'bondedAmount',
              label: "Bond",
              tooltip: "The total value the signers have bonded to guarantee this deposit.",
              value: <span>{(data.deposit.bondedECDSAKeep.totalBondAmount * 0.000000000000000001).toFixed(2)} ETH</span>
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
            {
              key: 'publicKey',
              label: "Public Key",
              value: data.deposit.bondedECDSAKeep.publicKey
            },
            {
              key: 'status',
              label: "Status",
              value: data.deposit.bondedECDSAKeep.status
            }
          ]} />
          <table>
            <tbody>
              <tr>
                <td>initialCollateralized Percent</td>
                <td>{data.deposit.initialCollateralizedPercent}</td>
              </tr>
              <tr>
                <td>collateralization Percent</td>
                <td>{data.deposit.collateralizationPercent}</td>
              </tr>
              <tr>
                <td>undercollateralized Threshold Percent</td>
                <td>{data.deposit.undercollateralizedThresholdPercent}</td>
              </tr>
              <tr>
                <td>severely Undercollateralized Threshold Percent</td>
                <td>{data.deposit.severelyUndercollateralizedThresholdPercent}</td>
              </tr>
            </tbody>
          </table>
        </Paper>
      </div>
    </div>

    <Paper>
      <div className={css`           
        padding: 20px;
      `}>
        <h3>Log</h3>
        <Log depositId={data.deposit.id} />
      </div>
    </Paper>
  </div>
}

function PropertyTable(props: {
  data: {
    key: string,
    label: string,
    tooltip?: string,
    value: any
  }[]
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

function Box(props: {
  label: string,
  children: any
}) {
  return (
    <div className={css`
      font-size: 35px;           
      padding: 20px;
      color: #0A0806;
      
      font-feature-settings: 'zero' on;
    `}>
        <div className={css`                         
          font-size: 16px;
        `}>
          {props.label}
        </div>
        <div>
          {props.children}
        </div>
    </div>
  )
}




function Log(props: {
  depositId: string
}) {
  const { loading, error, data } = useQuery(gql`
      query GetDepositLogs($depositId: ID!) {
          logEntries(where: {deposit: $depositId}, orderBy: timestamp, orderDirection:desc) {
              message,
              transactionHash,
              timestamp
          }
      }
  `, {variables: {depositId: props.depositId}});

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :( {""+ error}</p>;

  return <ul>
    {data.logEntries.map((logEntry: any) => {
      return <li><FormattedTime time={logEntry.timestamp} />: {logEntry.message}</li>
    })}
  </ul>
}