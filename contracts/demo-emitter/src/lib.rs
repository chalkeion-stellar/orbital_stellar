#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Env};

// Refreshed the same way the registry bumps its own entries — see
// registry/src/lib.rs for the ledger-math rationale.
const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;

#[contracttype]
enum DataKey {
    Count,
}

/// Emitted on every `ping()` call. Exists purely so a visitor to the public
/// demo can watch a real, harmless on-chain event arrive through the full
/// pipeline within seconds of clicking "Fire test event."
#[contractevent]
#[derive(Clone, Debug)]
pub struct Ping {
    #[topic]
    pub count: u32,
    pub timestamp: u64,
}

#[contract]
pub struct DemoEmitter;

#[contractimpl]
impl DemoEmitter {
    /// Increments the call counter, emits a `Ping` event carrying the new
    /// count, and returns it. Takes no arguments and requires no
    /// authorization from the caller — the only gate on who can call this is
    /// whoever holds the key that signs the transaction (kept outside this
    /// contract, in the server route that invokes it).
    pub fn ping(env: Env) -> u32 {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0)
            + 1;
        env.storage().instance().set(&DataKey::Count, &count);
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        Ping {
            count,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);

        count
    }
}

mod test;
