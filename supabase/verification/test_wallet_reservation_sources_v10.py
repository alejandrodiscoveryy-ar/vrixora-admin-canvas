"""SPECIFICATION MODEL ONLY. Does NOT execute PostgreSQL or prove the SQL migration.
Run: python -m unittest -v test_wallet_reservation_sources_v10.py
Production-equivalent integration tests require a separate isolated PostgreSQL database.
"""
from dataclasses import dataclass
from decimal import Decimal
import unittest


def cup(value):
    amount = Decimal(str(value))
    if amount.as_tuple().exponent < -2:
        raise ValueError('Only cent precision allowed')
    return amount


@dataclass(frozen=True)
class Hold:
    real: Decimal
    promo: Decimal
    @property
    def amount(self):
        return self.real + self.promo


class LedgerModel:
    def __init__(self):
        self.real = cup(0)
        self.promo = cup(0)
        self.holds = {}
        self.settled = {}
        self.reversed = set()
        self.initial_deposit_confirmed = False

    def topup(self, amount, confirmed):
        amount = cup(amount)
        if not confirmed or amount <= 0:
            raise ValueError('Topup must be genuinely confirmed and positive')
        self.real += amount
        if amount >= 500:
            self.initial_deposit_confirmed = True

    def referral(self, amount, first_settled_work):
        amount = cup(amount)
        if not first_settled_work or amount <= 0:
            raise ValueError('Referral needs first valid settled work')
        self.promo += amount

    def source_balances(self):
        held_real = sum((h.real for h in self.holds.values()), cup(0))
        held_promo = sum((h.promo for h in self.holds.values()), cup(0))
        if held_real > self.real or held_promo > self.promo:
            raise ValueError('Unfunded source reservation')
        return self.real - held_real, self.promo - held_promo

    def reserve(self, job_id, amount):
        amount = cup(amount)
        available_real, available_promo = self.source_balances()
        if job_id in self.holds or job_id in self.settled or amount <= 0 or amount > available_real + available_promo:
            raise ValueError('Unfunded or duplicate reservation')
        promo_part = min(available_promo, amount)
        self.holds[job_id] = Hold(amount - promo_part, promo_part)
        return self.holds[job_id]

    def cancel(self, job_id):
        if job_id not in self.holds:
            raise ValueError('Only open jobs may release a hold')
        del self.holds[job_id]

    def settle(self, job_id):
        hold = self.holds.pop(job_id)
        self.real -= hold.real
        self.promo -= hold.promo
        self.source_balances()
        self.settled[job_id] = hold
        return hold

    def reverse(self, job_id):
        if job_id in self.reversed or job_id not in self.settled:
            raise ValueError('Only one exact reversal per original commission')
        original = self.settled[job_id]
        self.real += original.real
        self.promo += original.promo
        self.reversed.add(job_id)
        return original


class SourceContractTests(unittest.TestCase):
    def test_only_real_confirmed_topup_activates_initial_deposit(self):
        w = LedgerModel()
        with self.assertRaises(ValueError): w.topup(500, confirmed=False)
        w.referral(100, first_settled_work=True)
        self.assertFalse(w.initial_deposit_confirmed)
        w.topup(500, confirmed=True)
        self.assertTrue(w.initial_deposit_confirmed)
        self.assertEqual((w.real, w.promo), (cup(500), cup(100)))

    def test_referral_requires_real_settled_job(self):
        w = LedgerModel()
        with self.assertRaises(ValueError): w.referral(100, first_settled_work=False)
        self.assertEqual(w.promo, 0)

    def test_reservation_records_promo_before_real(self):
        w = LedgerModel(); w.topup(500, True); w.referral(100, True)
        hold = w.reserve('A', 130)
        self.assertEqual(hold, Hold(cup(30), cup(100)))
        self.assertEqual(w.source_balances(), (cup(470), cup(0)))

    def test_two_reservations_keep_sources_even_after_new_reward(self):
        w = LedgerModel(); w.topup(500, True); w.referral(100, True)
        a = w.reserve('A', 60)
        b = w.reserve('B', 70)
        self.assertEqual(a, Hold(cup(0), cup(60)))
        self.assertEqual(b, Hold(cup(30), cup(40)))
        w.referral(100, True)
        self.assertEqual(w.settle('B'), b)
        self.assertEqual(w.settle('A'), a)
        self.assertEqual((w.real, w.promo), (cup(470), cup(100)))

    def test_refund_restores_exact_original_source_not_current_priority(self):
        w = LedgerModel(); w.topup(500, True); w.referral(100, True)
        hold = w.reserve('A', 130); w.settle('A'); w.referral(100, True)
        self.assertEqual(w.reverse('A'), hold)
        self.assertEqual((w.real, w.promo), (cup(500), cup(200)))
        with self.assertRaises(ValueError): w.reverse('A')

    def test_cancellation_releases_provenance_without_ledger_entry(self):
        w = LedgerModel(); w.topup(500, True); w.referral(100, True)
        w.reserve('A', 80); w.cancel('A')
        self.assertEqual(w.source_balances(), (cup(500), cup(100)))
        self.assertEqual((w.real, w.promo), (cup(500), cup(100)))

    def test_oversubscription_is_rejected_per_source(self):
        w = LedgerModel(); w.topup(500, True); w.referral(100, True)
        w.reserve('A', 590)
        with self.assertRaises(ValueError): w.reserve('B', 20)
        self.assertEqual(w.source_balances(), (cup(10), cup(0)))

    def test_commissions_never_reclassify_frozen_hold(self):
        w = LedgerModel(); w.topup(500, True)
        hold = w.reserve('A', 50)
        w.referral(100, True)
        self.assertEqual(w.settle('A'), hold)
        self.assertEqual((w.real, w.promo), (cup(450), cup(100)))

if __name__ == '__main__':
    unittest.main()
