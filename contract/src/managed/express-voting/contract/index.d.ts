import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  voterDni(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  voterSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  adminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  findVoterPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                commitment_0: Uint8Array): [PS, { leaf: Uint8Array,
                                                  path: { sibling: { field: bigint
                                                                   },
                                                          goes_left: boolean
                                                        }[]
                                                }];
}

export type ImpureCircuits<PS> = {
  verifyVoter(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  addVoter(context: __compactRuntime.CircuitContext<PS>,
           voterCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setVotingWindow(context: __compactRuntime.CircuitContext<PS>,
                  start_0: bigint,
                  end_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           voteCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  verifyVoter(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  addVoter(context: __compactRuntime.CircuitContext<PS>,
           voterCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setVotingWindow(context: __compactRuntime.CircuitContext<PS>,
                  start_0: bigint,
                  end_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           voteCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveVoterCommitment(dni_0: Uint8Array, secret_0: Uint8Array): Uint8Array;
  deriveVoterNullifier(secret_0: Uint8Array, election_0: Uint8Array): Uint8Array;
  deriveAdminCommitment(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveVoterCommitment(context: __compactRuntime.CircuitContext<PS>,
                        dni_0: Uint8Array,
                        secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveVoterNullifier(context: __compactRuntime.CircuitContext<PS>,
                       secret_0: Uint8Array,
                       election_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveAdminCommitment(context: __compactRuntime.CircuitContext<PS>,
                        secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyVoter(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  addVoter(context: __compactRuntime.CircuitContext<PS>,
           voterCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setVotingWindow(context: __compactRuntime.CircuitContext<PS>,
                  start_0: bigint,
                  end_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           voteCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly electionId: Uint8Array;
  voterRegistry: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  registeredVoterCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  usedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  voteCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly registeredVoterCount: bigint;
  readonly totalVotes: bigint;
  readonly votingStart: bigint;
  readonly votingEnd: bigint;
  readonly votingConfigured: boolean;
  readonly electionClosed: boolean;
  readonly adminCommitment: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               election_0: Uint8Array,
               voterA_0: Uint8Array,
               voterB_0: Uint8Array,
               voterC_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
