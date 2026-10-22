/** English words for the library: what each named model is, what to look for, where it comes from. */

/** The library's recipe cards: what each preset is, what to look for, where it comes from. */
export const PRESET_CARDS: Readonly<Record<string, { title: string; see: string; source: string }>> = {
  'yard-sale': { title: 'Yard sale', see: 'One square ends up with almost everything; the Gini climbs toward 1.', source: 'Hayes 2002' },
  'fixed-stake': { title: 'Fixed stake', see: 'A stable exponential distribution, Gini ≈ 0.5.', source: 'Drăgulescu & Yakovenko 2000' },
  'theft-fraud': { title: 'Theft and fraud', see: 'Stable and fairly equal: the richer square loses on average.', source: 'Hayes 2002' },
  saving: { title: 'Saving', see: 'A middle class: a gamma distribution of shape 4 at λ = 0.5.', source: 'Chakraborti & Chakrabarti 2000; Patriarca et al. 2004' },
  'mixed-saving': { title: 'Mixed saving', see: 'A heavy power-law tail; the thriftiest end richest.', source: 'Chatterjee, Chakrabarti & Manna 2003' },
  'tilt-to-poor': { title: 'Tilt to the poor', see: 'Still condenses unless ½ + b > p*(β) (0.525 at β = 0.1).', source: 'Moukarzel et al. 2007' },
  'wealth-tax': { title: 'Wealth tax', see: 'A stable steady state, Gini ≈ 0.30.', source: 'Boghosian 2014' },
  advantage: { title: 'Advantage: the richer are stronger', see: 'An oligarch appears once βζ > χ; at ζ = 0.01 it holds about 46 % (Boghosian’s straight-line coin: 1 − χ/(βζ) = 50 %).', source: 'Boghosian et al. 2017' },
  debt: { title: 'Debt', see: 'Negative wealth appears, down to −D.', source: 'Li et al. 2019' },
  growth: { title: 'Growth', see: 'No trade, only random growth: inequality grows without limit.', source: 'Berman, Peters & Adamou 2016' },
  'trickle-up': { title: 'Trickle up', see: 'The poor pay flat, the rich receive in proportion: concentration speeds up.', source: 'Berman, Peters & Adamou 2016' },
  local: { title: 'Local', see: 'Many local oligarchs surrounded by the poor; trade freezes. Raise v for one oligarch.', source: 'Bustos-Guajardo & Moukarzel 2012' },
  merit: { title: 'Merit', see: 'How strongly talent predicts final wealth as κ is dialled up.', source: 'After Pluchino, Biondo & Rapisarda 2018' },
  floor: { title: 'Floor', see: 'The minimum wealth rises; few stay near zero.', source: '—' },
  'income-tax': { title: 'Income tax', see: 'Settles at Gini ≈ 0.36 in this engine.', source: 'Bouleau & Chorro 2017' },
};
