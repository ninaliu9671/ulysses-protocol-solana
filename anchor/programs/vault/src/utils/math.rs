//! Integer square root via Newton iteration. See DESIGN.md OQ-1.

/// Computes floor(sqrt(n)) for a u128 input using pure-integer Newton iteration. See DESIGN.md OQ-1.
pub fn integer_sqrt_u128(n: u128) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = x / 2 + (x & 1);
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqrt_zero() {
        assert_eq!(integer_sqrt_u128(0), 0);
    }

    #[test]
    fn sqrt_one() {
        assert_eq!(integer_sqrt_u128(1), 1);
    }

    #[test]
    fn sqrt_perfect_squares() {
        assert_eq!(integer_sqrt_u128(4), 2);
        assert_eq!(integer_sqrt_u128(9), 3);
        assert_eq!(integer_sqrt_u128(100), 10);
        assert_eq!(integer_sqrt_u128(10_000), 100);
        assert_eq!(integer_sqrt_u128(1_000_000), 1000);
    }

    #[test]
    fn sqrt_non_perfect_squares() {
        assert_eq!(integer_sqrt_u128(2), 1);
        assert_eq!(integer_sqrt_u128(3), 1);
        assert_eq!(integer_sqrt_u128(8), 2);
        assert_eq!(integer_sqrt_u128(99), 9);
        assert_eq!(integer_sqrt_u128(101), 10);
    }

    #[test]
    fn sqrt_u64_max() {
        let n = u64::MAX as u128;
        let r = integer_sqrt_u128(n);
        let r128 = r as u128;
        assert!(r128 * r128 <= n);
        assert!((r128 + 1) * (r128 + 1) > n);
    }

    #[test]
    fn sqrt_one_sol_30days() {
        // 1 SOL (10^9 lamports) * 30 days = 3 * 10^10
        let n: u128 = 1_000_000_000u128 * 30;
        let r = integer_sqrt_u128(n);
        assert_eq!(r, 173_205);
        let r128 = r as u128;
        assert!(r128 * r128 <= n);
        assert!((r128 + 1) * (r128 + 1) > n);
    }

    #[test]
    fn sqrt_max_protocol_case() {
        // 10^17 * 365 = 3.65 * 10^19, fits in u128
        let n: u128 = 100_000_000_000_000_000u128 * 365;
        let r = integer_sqrt_u128(n);
        // sqrt ~= 6.04 * 10^9
        assert!(r >= 6_000_000_000 && r <= 6_100_000_000);
        let r128 = r as u128;
        assert!(r128 * r128 <= n);
        assert!((r128 + 1) * (r128 + 1) > n);
    }

    #[test]
    fn sqrt_u128_max() {
        let r = integer_sqrt_u128(u128::MAX);
        // Result must fit in u64
        assert!(r as u128 <= u64::MAX as u128);
        // r^2 <= u128::MAX is trivially true if r fits u64
        let r128 = r as u128;
        assert!(r128 * r128 <= u128::MAX);
        // Skip upper bound check when r == u64::MAX since (u64::MAX+1)^2 overflows u128
        if r < u64::MAX {
            assert!((r128 + 1) * (r128 + 1) > u128::MAX || r128 + 1 > u64::MAX as u128);
        }
    }

    #[test]
    fn sqrt_determinism() {
        let inputs: [u128; 5] = [0, 1, 12345, 1_000_000_000_000, u128::MAX / 2];
        for &n in &inputs {
            assert_eq!(integer_sqrt_u128(n), integer_sqrt_u128(n));
        }
    }

    #[test]
    fn sqrt_invariant_holds() {
        let inputs: [u128; 8] = [
            2,
            7,
            50,
            123_456,
            987_654_321,
            1_000_000_000_000,
            3_650_000_000_000_000_000_000u128,
            u128::MAX - 1,
        ];
        for &n in &inputs {
            let r = integer_sqrt_u128(n);
            let r128 = r as u128;
            assert!(r128 * r128 <= n, "r^2 <= n failed for n={}", n);
            if r < u64::MAX {
                let next = r128 + 1;
                // Guard against overflow on (r+1)^2 when n is near u128::MAX
                if let Some(sq) = next.checked_mul(next) {
                    assert!(sq > n, "(r+1)^2 > n failed for n={}", n);
                }
            }
        }
    }
}
