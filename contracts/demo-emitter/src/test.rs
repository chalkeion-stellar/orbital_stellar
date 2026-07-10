#![cfg(test)]

use super::{DemoEmitter, DemoEmitterClient};
use soroban_sdk::Env;

fn setup(env: &Env) -> DemoEmitterClient<'_> {
    let contract_id = env.register(DemoEmitter, ());
    DemoEmitterClient::new(env, &contract_id)
}

#[test]
fn ping_returns_incrementing_count() {
    let env = Env::default();
    let client = setup(&env);

    assert_eq!(client.ping(), 1);
    assert_eq!(client.ping(), 2);
    assert_eq!(client.ping(), 3);
}

#[test]
fn ping_requires_no_auth() {
    // No env.mock_all_auths() and no require_auth() call in ping() — this
    // should succeed without any authorization setup at all.
    let env = Env::default();
    let client = setup(&env);
    client.ping();
}
