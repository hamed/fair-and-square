/** English words for the library: what each named model is, what to look for, where it comes from. */

/** The library's recipe cards: what each preset is, what to look for, where it comes from. */
export const PRESET_CARDS: Readonly<Record<string, { title: string; see: string; source: string }>> = {
  'yard-sale': { title: 'Yard sale', see: 'Equal winning odds; stake based on the poorer partner’s wealth.', source: 'Hayes 2002' },
  'fixed-stake': { title: 'Fixed stake', see: 'A stable exponential distribution, Gini ≈ 0.5.', source: 'Drăgulescu & Yakovenko 2000' },
  'theft-fraud': { title: 'Theft and fraud', see: 'Stable and fairly equal: the richer square loses on average.', source: 'Hayes 2002' },
  saving: { title: 'Saving', see: 'A middle class: a gamma distribution of shape 4 at λ = 0.5.', source: 'Chakraborti & Chakrabarti 2000; Patriarca et al. 2004' },
  'mixed-saving': { title: 'Mixed saving', see: 'A heavy power-law tail; the thriftiest end richest.', source: 'Chatterjee, Chakrabarti & Manna 2003' },
  'tilt-to-poor': { title: 'Tilt to the poor', see: 'Still condenses unless ½ + b > p*(β) (0.525 at β = 0.1).', source: 'Moukarzel et al. 2007' },
  'wealth-tax': { title: 'Wealth tax', see: 'Yard sale with a wealth tax redistributed equally.', source: 'Boghosian 2014' },
  advantage: { title: 'Advantage: the richer are stronger', see: 'Winning odds favour richer partners; wealth tax is redistributed equally.', source: 'Boghosian et al. 2017' },
  debt: { title: 'Debt', see: 'Negative wealth appears, down to −D.', source: 'Li et al. 2019' },
  growth: { title: 'Growth', see: 'No trade, only random growth: inequality grows without limit.', source: 'Berman, Peters & Adamou 2016' },
  'trickle-up': { title: 'Trickle up', see: 'The poor pay flat, the rich receive in proportion: concentration speeds up.', source: 'Berman, Peters & Adamou 2016' },
  local: { title: 'Local', see: 'Many local oligarchs surrounded by the poor; trade freezes. Raise v for one oligarch.', source: 'Bustos-Guajardo & Moukarzel 2012' },
  merit: { title: 'Merit', see: 'Winning odds favour more talented partners.', source: 'After Pluchino, Biondo & Rapisarda 2018' },
  floor: { title: 'Floor', see: 'The minimum wealth rises; few stay near zero.', source: '—' },
  'income-tax': { title: 'Income tax', see: 'Settles at Gini ≈ 0.36 in this engine.', source: 'Bouleau & Chorro 2017' },
};
