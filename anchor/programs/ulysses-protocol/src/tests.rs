#[cfg(test)]
mod tests {
    use crate::ID as PROGRAM_ID;
    use litesvm::LiteSVM;
    use solana_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        system_program,
        transaction::Transaction,
    };

    // -------------------------------------------------------------------------
    // Discriminators — sha256("global:<name>")[0..8]
    // Verified against the Anchor IDL / anchor-lang source
    // -------------------------------------------------------------------------
    // sha256("global:initialize")[0..8]
    const DISC_INITIALIZE: [u8; 8] = [0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed];
    // sha256("global:create_commitment")[0..8]
    const DISC_CREATE_COMMITMENT: [u8; 8] = [0xe8, 0x1f, 0x76, 0x41, 0xe5, 0x02, 0x02, 0xaa];
    // sha256("global:slash")[0..8]
    const DISC_SLASH: [u8; 8] = [0xcc, 0x8d, 0x12, 0xa1, 0x08, 0xb1, 0x5c, 0x8e];
    // sha256("global:cancel_commitment")[0..8]
    const DISC_CANCEL_COMMITMENT: [u8; 8] = [0x24, 0x27, 0x46, 0x89, 0x47, 0xb3, 0x58, 0xe8];
    // sha256("global:claim")[0..8]
    const DISC_CLAIM: [u8; 8] = [0x3e, 0xc6, 0x13, 0x57, 0x39, 0xd8, 0xb5, 0x03];

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
    const MIN_STAKE: u64 = 10_000_000; // 0.01 SOL
    const MIN_DURATION: u32 = 86_400;  // 1 day in seconds
    const MAX_FEE: u64 = 10_000;

    // SPL Token Program ID — target_mint accounts must be owned by this
    const SPL_TOKEN_PROGRAM_ID: Pubkey =
        solana_sdk::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    // -------------------------------------------------------------------------
    // PDA helpers
    // -------------------------------------------------------------------------
    fn protocol_state_pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"protocol"], &PROGRAM_ID)
    }

    fn protocol_vault_pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"protocol_vault"], &PROGRAM_ID)
    }

    fn commitment_pda(owner: &Pubkey, target_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"commitment", owner.as_ref(), target_mint.as_ref()],
            &PROGRAM_ID,
        )
    }

    fn vault_pda(commitment: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", commitment.as_ref()], &PROGRAM_ID)
    }

    // -------------------------------------------------------------------------
    // SPL mint helper
    // create_commitment validates target_mint.owner == SPL_TOKEN_PROGRAM_ID
    // Pubkey::new_unique() creates a system-owned account which fails that check.
    // -------------------------------------------------------------------------
    fn make_spl_mint(svm: &mut LiteSVM) -> Pubkey {
        let mint = Pubkey::new_unique();
        svm.set_account(
            mint,
            solana_sdk::account::Account {
                lamports: 1_461_600,
                data: vec![0u8; 82],
                owner: SPL_TOKEN_PROGRAM_ID,
                executable: false,
                rent_epoch: u64::MAX,
            },
        )
        .unwrap();
        mint
    }

    // -------------------------------------------------------------------------
    // CommitmentType encoders (Borsh enum)
    // -------------------------------------------------------------------------
    fn encode_nobuy() -> Vec<u8> {
        vec![0u8]
    }
    fn encode_nosell() -> Vec<u8> {
        vec![1u8]
    }
    fn encode_holdabove(threshold: u64) -> Vec<u8> {
        let mut v = vec![2u8];
        v.extend_from_slice(&threshold.to_le_bytes());
        v
    }
    fn encode_holduntil(unlock_at: i64) -> Vec<u8> {
        let mut v = vec![3u8];
        v.extend_from_slice(&unlock_at.to_le_bytes());
        v
    }
    fn encode_notradewindow(start: u8, end: u8) -> Vec<u8> {
        vec![4u8, start, end]
    }
    fn encode_agentguardian() -> Vec<u8> {
        vec![5u8]
    }

    /// Option<Pubkey>: None → [0], Some(k) → [1] + k (32 bytes)
    fn encode_option_pubkey(opt: Option<&Pubkey>) -> Vec<u8> {
        match opt {
            None => vec![0u8],
            Some(k) => {
                let mut v = vec![1u8];
                v.extend_from_slice(k.as_ref());
                v
            }
        }
    }

    // -------------------------------------------------------------------------
    // Instruction builders
    // -------------------------------------------------------------------------

    fn make_initialize_ix(
        payer: &Pubkey,
        protocol_state: &Pubkey,
        protocol_vault: &Pubkey,
        authority: &Pubkey,
    ) -> Instruction {
        let mut data = DISC_INITIALIZE.to_vec();
        data.extend_from_slice(authority.as_ref());
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*payer, true),
                AccountMeta::new(*protocol_state, false),
                AccountMeta::new(*protocol_vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn make_create_commitment_ix(
        owner: &Pubkey,
        target_mint: &Pubkey,
        commitment_account: &Pubkey,
        commitment_vault: &Pubkey,
        protocol_state: &Pubkey,
        commitment_type_bytes: Vec<u8>,
        stake_amount: u64,
        duration_secs: u32,
        guardian_pubkey: Option<&Pubkey>,
    ) -> Instruction {
        let mut data = DISC_CREATE_COMMITMENT.to_vec();
        data.extend_from_slice(&commitment_type_bytes);
        data.extend_from_slice(&stake_amount.to_le_bytes());
        data.extend_from_slice(&duration_secs.to_le_bytes());
        data.extend_from_slice(&encode_option_pubkey(guardian_pubkey));

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new_readonly(*target_mint, false),
                AccountMeta::new(*commitment_account, false),
                AccountMeta::new(*commitment_vault, false),
                AccountMeta::new(*protocol_state, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn make_slash_ix(
        authority: &Pubkey,
        protocol_state: &Pubkey,
        commitment_account: &Pubkey,
        commitment_vault: &Pubkey,
        protocol_vault: &Pubkey,
        tx_signature: [u8; 64],
    ) -> Instruction {
        let mut data = DISC_SLASH.to_vec();
        data.extend_from_slice(&tx_signature);

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*authority, true),
                AccountMeta::new(*protocol_state, false),
                AccountMeta::new(*commitment_account, false),
                AccountMeta::new(*commitment_vault, false),
                AccountMeta::new(*protocol_vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn make_cancel_commitment_ix(
        owner: &Pubkey,
        commitment_account: &Pubkey,
        commitment_vault: &Pubkey,
        protocol_state: &Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*commitment_account, false),
                AccountMeta::new(*commitment_vault, false),
                AccountMeta::new(*protocol_state, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: DISC_CANCEL_COMMITMENT.to_vec(),
        }
    }

    fn make_claim_ix(
        owner: &Pubkey,
        commitment_account: &Pubkey,
        commitment_vault: &Pubkey,
        protocol_state: &Pubkey,
        protocol_vault: &Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*commitment_account, false),
                AccountMeta::new(*commitment_vault, false),
                AccountMeta::new(*protocol_state, false),
                AccountMeta::new(*protocol_vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: DISC_CLAIM.to_vec(),
        }
    }

    // -------------------------------------------------------------------------
    // Setup helpers
    // -------------------------------------------------------------------------

    fn load_svm() -> LiteSVM {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/ulysses_protocol.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);
        svm
    }

    /// Initialize protocol and return (protocol_state, protocol_vault, authority)
    fn do_initialize(svm: &mut LiteSVM, payer: &Keypair) -> (Pubkey, Pubkey, Keypair) {
        let authority = Keypair::new();
        let (protocol_state, _) = protocol_state_pda();
        let (protocol_vault, _) = protocol_vault_pda();
        let ix = make_initialize_ix(
            &payer.pubkey(),
            &protocol_state,
            &protocol_vault,
            &authority.pubkey(),
        );
        let bh = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[payer], bh);
        svm.send_transaction(tx).expect("initialize should succeed");
        (protocol_state, protocol_vault, authority)
    }

    /// Create a commitment and return (commitment_account, commitment_vault)
    fn do_create_commitment(
        svm: &mut LiteSVM,
        owner: &Keypair,
        target_mint: &Pubkey,
        protocol_state: &Pubkey,
        commitment_type_bytes: Vec<u8>,
        stake_amount: u64,
        duration_secs: u32,
        guardian: Option<&Pubkey>,
    ) -> (Pubkey, Pubkey) {
        let (commitment_account, _) = commitment_pda(&owner.pubkey(), target_mint);
        let (commitment_vault, _) = vault_pda(&commitment_account);

        let ix = make_create_commitment_ix(
            &owner.pubkey(),
            target_mint,
            &commitment_account,
            &commitment_vault,
            protocol_state,
            commitment_type_bytes,
            stake_amount,
            duration_secs,
            guardian,
        );
        let bh = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[owner], bh);
        svm.send_transaction(tx).expect("create_commitment should succeed");
        (commitment_account, commitment_vault)
    }

    /// Full setup: init protocol, create NoBuy commitment with SPL mint.
    /// Returns (owner, authority, protocol_state, target_mint, commitment_account, commitment_vault, protocol_vault)
    fn full_setup(
        svm: &mut LiteSVM,
    ) -> (
        Keypair, // owner
        Keypair, // authority
        Pubkey,  // protocol_state
        Pubkey,  // target_mint
        Pubkey,  // commitment_account
        Pubkey,  // commitment_vault
        Pubkey,  // protocol_vault
    ) {
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        // do_initialize creates its own authority keypair internally
        let (protocol_state, protocol_vault, authority_kp) = do_initialize(svm, &owner);
        svm.airdrop(&authority_kp.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Use SPL-owned mint so the program's owner check passes
        let target_mint = make_spl_mint(svm);

        let (commitment_account, _) = commitment_pda(&owner.pubkey(), &target_mint);
        let (commitment_vault, _) = vault_pda(&commitment_account);

        let ix2 = make_create_commitment_ix(
            &owner.pubkey(),
            &target_mint,
            &commitment_account,
            &commitment_vault,
            &protocol_state,
            encode_nobuy(),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );
        let bh = svm.latest_blockhash();
        let tx2 =
            Transaction::new_signed_with_payer(&[ix2], Some(&owner.pubkey()), &[&owner], bh);
        svm.send_transaction(tx2).expect("create_commitment");

        (
            owner,
            authority_kp,
            protocol_state,
            target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        )
    }

    // =========================================================================
    // Suite 1: initialize
    // =========================================================================

    #[test]
    fn test_initialize_success() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();

        let authority = Keypair::new();
        let (protocol_state, _) = protocol_state_pda();
        let (protocol_vault, _) = protocol_vault_pda();

        let ix = make_initialize_ix(
            &payer.pubkey(),
            &protocol_state,
            &protocol_vault,
            &authority.pubkey(),
        );
        let bh = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "initialize should succeed: {:?}", result.err());

        let account = svm.get_account(&protocol_state);
        assert!(account.is_some(), "ProtocolState PDA should exist after initialize");
    }

    #[test]
    fn test_initialize_sets_correct_authority() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();

        let authority = Keypair::new();
        let (protocol_state, _) = protocol_state_pda();
        let (protocol_vault, _) = protocol_vault_pda();

        let ix = make_initialize_ix(
            &payer.pubkey(),
            &protocol_state,
            &protocol_vault,
            &authority.pubkey(),
        );
        let bh = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
        svm.send_transaction(tx).expect("initialize should succeed");

        // authority is at offset 8..40 (after 8-byte Anchor discriminator)
        let account = svm.get_account(&protocol_state).expect("should exist");
        let data = &account.data;
        assert!(data.len() >= 40, "data too short: {}", data.len());

        let stored_authority = Pubkey::try_from(&data[8..40]).expect("invalid pubkey bytes");
        assert_eq!(
            stored_authority,
            authority.pubkey(),
            "stored authority should match the one passed to initialize"
        );
    }

    // =========================================================================
    // Suite 2: create_commitment
    // =========================================================================

    #[test]
    fn test_create_nobuy_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (commitment_account, commitment_vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_nobuy(),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        let account = svm.get_account(&commitment_account);
        assert!(account.is_some(), "commitment account should exist");
        let vault_account = svm.get_account(&commitment_vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE, "vault should hold stake");
    }

    #[test]
    fn test_create_nosell_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (_commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_nosell(),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);
    }

    #[test]
    fn test_create_holdabove_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (_commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_holdabove(1_000_000),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);
    }

    #[test]
    fn test_create_holduntil_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        // unlock_at = far future (year 2099)
        let unlock_at: i64 = 4_070_908_800;

        let (_commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_holduntil(unlock_at),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);
    }

    #[test]
    fn test_create_notradewindow_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (_commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_notradewindow(9, 17),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);
    }

    #[test]
    fn test_create_agentguardian_commitment() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_agentguardian(),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        assert!(
            svm.get_account(&commitment_account).is_some(),
            "commitment account should exist for AgentGuardian variant"
        );
        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);
    }

    #[test]
    fn test_create_with_guardian_pubkey() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);
        let guardian = Pubkey::new_unique();

        let (commitment_account, vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_nobuy(),
            MIN_STAKE,
            MIN_DURATION,
            Some(&guardian),
        );

        let vault_account = svm.get_account(&vault).expect("vault should exist");
        assert_eq!(vault_account.lamports, MIN_STAKE);

        // Verify guardian stored correctly.
        // CommitmentAccount layout after 8-byte Anchor discriminator (for NoBuy/None guardian):
        // [0..32]   owner: Pubkey
        // [32..64]  target_mint: Pubkey
        // [64]      commitment_type: u8 = 0 (NoBuy)
        // [65..73]  stake_amount: u64
        // [73]      guardian_pubkey: u8 = 0 (None) or 1 (Some)
        // [74..106] guardian pubkey bytes (when Some)
        let acct_data = svm.get_account(&commitment_account).unwrap();
        let data = &acct_data.data[8..]; // skip discriminator

        // guardian option starts at offset 73 (not 105 — slash_destination is gone)
        let guardian_option_offset = 32 + 32 + 1 + 8; // = 73
        assert_eq!(
            data[guardian_option_offset], 1,
            "guardian_pubkey Some discriminant should be 1"
        );
        let stored_guardian =
            Pubkey::try_from(&data[guardian_option_offset + 1..guardian_option_offset + 33])
                .expect("invalid guardian pubkey");
        assert_eq!(stored_guardian, guardian, "stored guardian should match");
    }

    #[test]
    fn test_create_fails_stake_too_small() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);
        let (commitment_account, _) = commitment_pda(&payer.pubkey(), &target_mint);
        let (commitment_vault, _) = vault_pda(&commitment_account);

        let too_small = MIN_STAKE - 1;
        let ix = make_create_commitment_ix(
            &payer.pubkey(),
            &target_mint,
            &commitment_account,
            &commitment_vault,
            &protocol_state,
            encode_nobuy(),
            too_small,
            MIN_DURATION,
            None,
        );
        let bh = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "create_commitment with stake below minimum should fail"
        );
    }

    #[test]
    fn test_create_fails_duration_too_short() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);
        let (commitment_account, _) = commitment_pda(&payer.pubkey(), &target_mint);
        let (commitment_vault, _) = vault_pda(&commitment_account);

        let too_short_duration = MIN_DURATION - 1; // 86399 < 86400 minimum
        let ix = make_create_commitment_ix(
            &payer.pubkey(),
            &target_mint,
            &commitment_account,
            &commitment_vault,
            &protocol_state,
            encode_nobuy(),
            MIN_STAKE,
            too_short_duration,
            None,
        );
        let bh = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&payer.pubkey()), &[&payer], bh);
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "create_commitment with duration below minimum (86400s) should fail"
        );
    }

    #[test]
    fn test_weight_nonzero_after_create() {
        let mut svm = load_svm();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        let (protocol_state, _protocol_vault, _auth) = do_initialize(&mut svm, &payer);

        let target_mint = make_spl_mint(&mut svm);

        let (commitment_account, _vault) = do_create_commitment(
            &mut svm,
            &payer,
            &target_mint,
            &protocol_state,
            encode_nobuy(),
            MIN_STAKE,
            MIN_DURATION,
            None,
        );

        // CommitmentAccount layout after 8-byte discriminator (NoBuy, None guardian):
        // [0..32]   owner
        // [32..64]  target_mint
        // [64]      commitment_type u8
        // [65..73]  stake_amount u64
        // [73]      guardian option tag (None=0)
        // [74]      is_active bool
        // [75..83]  created_at i64
        // [83]      bump u8
        // [84]      vault_bump u8
        // [85..93]  weight u64
        let acct_data = svm.get_account(&commitment_account).expect("commitment should exist");
        let data = &acct_data.data[8..]; // skip discriminator

        let weight_offset = 32 + 32 + 1 + 8 + 1 + 1 + 8 + 1 + 1; // = 85
        let weight = u64::from_le_bytes(
            data[weight_offset..weight_offset + 8]
                .try_into()
                .expect("weight slice"),
        );
        assert!(weight > 0, "weight should be nonzero after create, got {}", weight);
    }

    // =========================================================================
    // Suite 3: slash
    // =========================================================================

    #[test]
    fn test_slash_last_staker_authority_receives_funds() {
        // When there is only one staker in the pool (remaining_weight = 0 after slash),
        // lamports go to authority, not protocol_vault.
        let mut svm = load_svm();
        let (
            _owner,
            authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        let vault_balance = svm
            .get_account(&commitment_vault)
            .expect("vault should exist")
            .lamports;
        assert!(vault_balance > 0, "vault should have lamports before slash");

        let authority_balance_before = svm
            .get_account(&authority.pubkey())
            .map(|a| a.lamports)
            .unwrap_or(0);

        let tx_sig = [0u8; 64];
        let ix = make_slash_ix(
            &authority.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig,
        );
        let bh = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&authority.pubkey()),
            &[&authority],
            bh,
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_ok(), "slash should succeed: {:?}", result.err());

        // vault should be empty (drained)
        let vault_after = svm
            .get_account(&commitment_vault)
            .map(|a| a.lamports)
            .unwrap_or(0);
        assert_eq!(vault_after, 0, "vault should be empty after slash");

        // authority should have received the funds (single staker path)
        let authority_balance_after = svm
            .get_account(&authority.pubkey())
            .map(|a| a.lamports)
            .unwrap_or(0);
        // Net change: received vault_balance, spent tx fee. Net should be positive.
        assert!(
            authority_balance_after >= authority_balance_before + vault_balance - MAX_FEE,
            "authority should receive at least vault_balance minus fees: before={}, after={}, vault={}",
            authority_balance_before,
            authority_balance_after,
            vault_balance
        );
    }

    #[test]
    fn test_slash_closes_commitment_account() {
        // After slash the commitment_account PDA is closed (close=authority).
        let mut svm = load_svm();
        let (
            _owner,
            authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        let tx_sig = [1u8; 64];
        let ix = make_slash_ix(
            &authority.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig,
        );
        let bh = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&authority.pubkey()),
            &[&authority],
            bh,
        );
        svm.send_transaction(tx).expect("slash should succeed");

        // vault should also be drained
        let vault_after = svm
            .get_account(&commitment_vault)
            .map(|a| a.lamports)
            .unwrap_or(0);
        assert_eq!(vault_after, 0, "commitment_vault should be empty after slash");

        // Account is destroyed — must be None
        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed (None) after slash"
        );
    }

    #[test]
    fn test_slash_fails_wrong_authority() {
        let mut svm = load_svm();
        let (
            _owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        let impostor = Keypair::new();
        svm.airdrop(&impostor.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let tx_sig = [2u8; 64];
        let ix = make_slash_ix(
            &impostor.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig,
        );
        let bh = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&impostor.pubkey()),
            &[&impostor],
            bh,
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "slash with wrong authority should fail");
    }

    #[test]
    fn test_slash_fails_already_closed() {
        // After first slash the account is destroyed; second slash should fail
        // because the PDA no longer exists.
        let mut svm = load_svm();
        let (
            _owner,
            authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        // First slash — succeeds
        let tx_sig = [3u8; 64];
        let ix = make_slash_ix(
            &authority.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig,
        );
        let bh = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&authority.pubkey()),
            &[&authority],
            bh,
        );
        svm.send_transaction(tx).expect("first slash should succeed");

        // Confirm account is gone
        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed after first slash"
        );

        // Second slash — must fail because account no longer exists
        let tx_sig2 = [4u8; 64];
        let ix2 = make_slash_ix(
            &authority.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig2,
        );
        let bh = svm.latest_blockhash();
        let tx2 = Transaction::new_signed_with_payer(
            &[ix2],
            Some(&authority.pubkey()),
            &[&authority],
            bh,
        );
        let result = svm.send_transaction(tx2);
        assert!(
            result.is_err(),
            "second slash should fail: commitment account already closed"
        );
    }

    // =========================================================================
    // Suite 4: cancel_commitment
    // =========================================================================

    #[test]
    fn test_cancel_refunds_owner() {
        let mut svm = load_svm();
        let (
            owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            _protocol_vault,
        ) = full_setup(&mut svm);

        let owner_balance_before = svm.get_account(&owner.pubkey()).unwrap().lamports;

        // Warp clock past unlock_time (MIN_DURATION=86400s; 300_000 slots ≈ 120_000s)
        svm.warp_to_slot(300_000);

        let ix_cancel = make_cancel_commitment_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix_cancel],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ));
        assert!(result.is_ok(), "cancel should succeed: {:?}", result.err());

        let vault_after = svm
            .get_account(&commitment_vault)
            .map(|a| a.lamports)
            .unwrap_or(0);
        assert_eq!(vault_after, 0, "vault should be empty after cancel");

        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed after cancel"
        );

        let owner_balance_after = svm.get_account(&owner.pubkey()).unwrap().lamports;
        assert!(
            owner_balance_after >= owner_balance_before + MIN_STAKE - MAX_FEE,
            "owner should receive at least MIN_STAKE minus fees: before={}, after={}, stake={}",
            owner_balance_before,
            owner_balance_after,
            MIN_STAKE
        );
    }

    #[test]
    fn test_cancel_closes_commitment_account() {
        let mut svm = load_svm();
        let (
            owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            _protocol_vault,
        ) = full_setup(&mut svm);

        // Warp past unlock_time
        svm.warp_to_slot(300_000);

        let ix = make_cancel_commitment_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
        );
        let bh = svm.latest_blockhash();
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ))
        .expect("cancel should succeed");

        // Account must be closed (destroyed)
        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed (None) after cancel"
        );
    }

    #[test]
    fn test_cancel_fails_wrong_owner() {
        // The impostor sends their own pubkey as the owner account.
        // Anchor's has_one constraint checks commitment.owner == owner.key(),
        // which will mismatch — no time warp needed (fails before lock check).
        let mut svm = load_svm();
        let (
            _owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            _protocol_vault,
        ) = full_setup(&mut svm);

        let impostor = Keypair::new();
        svm.airdrop(&impostor.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let ix = make_cancel_commitment_ix(
            &impostor.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&impostor.pubkey()),
            &[&impostor],
            bh,
        ));
        assert!(result.is_err(), "cancel by wrong owner should fail");
    }

    #[test]
    fn test_cancel_fails_already_slashed() {
        // After slash the account is closed; cancel then fails because the PDA is gone.
        let mut svm = load_svm();
        let (
            owner,
            authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        // Slash first — closes the account
        let tx_sig = [5u8; 64];
        let ix_slash = make_slash_ix(
            &authority.pubkey(),
            &protocol_state,
            &commitment_account,
            &commitment_vault,
            &protocol_vault,
            tx_sig,
        );
        let bh = svm.latest_blockhash();
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix_slash],
            Some(&authority.pubkey()),
            &[&authority],
            bh,
        ))
        .expect("slash should succeed");

        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed after slash"
        );

        // Warp past unlock_time (doesn't matter — account is already gone)
        svm.warp_to_slot(300_000);

        // Cancel should fail because account no longer exists
        let ix_cancel = make_cancel_commitment_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix_cancel],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ));
        assert!(
            result.is_err(),
            "cancel after slash should fail: commitment account already closed"
        );
    }

    #[test]
    fn test_cancel_fails_before_unlock() {
        // Attempt cancel immediately after create (clock not warped).
        // Should fail with CommitmentStillLocked or similar timelock error.
        let mut svm = load_svm();
        let (
            owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            _protocol_vault,
        ) = full_setup(&mut svm);

        // NO clock warp — still within the lock period
        let ix = make_cancel_commitment_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ));
        assert!(
            result.is_err(),
            "cancel before unlock_time should fail with CommitmentStillLocked"
        );
    }

    // =========================================================================
    // Suite 5: claim (NEW)
    // =========================================================================

    #[test]
    fn test_claim_returns_principal() {
        // claim after time warp: vault empty, commitment_account None, owner balance increased.
        let mut svm = load_svm();
        let (
            owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        let owner_balance_before = svm.get_account(&owner.pubkey()).unwrap().lamports;

        // Warp past unlock_time
        svm.warp_to_slot(300_000);

        let ix = make_claim_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
            &protocol_vault,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ));
        assert!(result.is_ok(), "claim should succeed: {:?}", result.err());

        // vault should be empty
        let vault_after = svm
            .get_account(&commitment_vault)
            .map(|a| a.lamports)
            .unwrap_or(0);
        assert_eq!(vault_after, 0, "vault should be empty after claim");

        // commitment_account should be closed (close=owner)
        assert!(
            svm.get_account(&commitment_account).is_none(),
            "commitment_account should be closed (None) after claim"
        );

        // owner should have received principal back (plus rent, minus tx fee)
        let owner_balance_after = svm.get_account(&owner.pubkey()).unwrap().lamports;
        assert!(
            owner_balance_after >= owner_balance_before + MIN_STAKE - MAX_FEE,
            "owner should receive at least MIN_STAKE minus fees: before={}, after={}, stake={}",
            owner_balance_before,
            owner_balance_after,
            MIN_STAKE
        );
    }

    #[test]
    fn test_claim_fails_before_unlock() {
        // Attempt claim immediately after create (clock not warped). Should fail.
        let mut svm = load_svm();
        let (
            owner,
            _authority,
            protocol_state,
            _target_mint,
            commitment_account,
            commitment_vault,
            protocol_vault,
        ) = full_setup(&mut svm);

        // NO clock warp — still within the lock period
        let ix = make_claim_ix(
            &owner.pubkey(),
            &commitment_account,
            &commitment_vault,
            &protocol_state,
            &protocol_vault,
        );
        let bh = svm.latest_blockhash();
        let result = svm.send_transaction(Transaction::new_signed_with_payer(
            &[ix],
            Some(&owner.pubkey()),
            &[&owner],
            bh,
        ));
        assert!(
            result.is_err(),
            "claim before unlock_time should fail with CommitmentStillLocked"
        );
    }
}
