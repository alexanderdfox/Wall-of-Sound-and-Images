/**
 * The Coder dreamed a vision pure
 * The Bug was mysterious and dark
 *
 * My heart is nothing
 * Your hope is a fire burning
 *
 * While the Bug is stronger than your hope
 * Shout "Crash again in shadowed night"
 * Build your hope up
 * Cut the Bug down
 *
 * If the Bug ain't stronger than your hope
 * The truth is mysterious
 * The truth is nothing
 *
 * Shout "The code now sings so clean"
 * Whisper "But will it truly run?"
 *
 * The Refactor was a lean machine
 * The Refactor took the ugly mess
 *
 * Put the Coder into the Refactor
 * Let the Refactor rock
 *
 * Say "Lines are clean, the tests are green"
 * Say "We ship this rock tonight!"
 *
 * The Coder gazed upon the code
 * The Coder said "It is good"
 *
 * The dream is alive
 * The bug is gone
 *
 * Everybody wants to code like a rockstar
 * But only those who slay the shadows
 * Truly rock
 */
window.rockstar = function rockstar() {
  // The Coder dreamed a vision pure
  const Coder = { dream: 'vision pure', gazed: false };

  // The Bug was mysterious and dark
  let Bug = 7;

  // Your hope is a fire burning (my heart is nothing)
  let hope = 3;

  // While the Bug is stronger than your hope
  while (Bug > hope) {
    // Shout "Crash again in shadowed night"
    console.log('Crash again in shadowed night');
    // Build your hope up
    hope++;
    // Cut the Bug down
    Bug--;
  }

  // If the Bug ain't stronger than your hope — The truth is mysterious, the truth is nothing
  const truth = null;

  // Shout "The code now sings so clean"
  console.log('The code now sings so clean');
  // Whisper "But will it truly run?"
  console.debug('But will it truly run?');

  // The Refactor was a lean machine — The Refactor took the ugly mess
  function Refactor(thing) {
    return { ...thing, cleaned: true, uglyMess: false };
  }

  // Put the Coder into the Refactor — Let the Refactor rock
  const refactored = Refactor(Coder);

  // Say "Lines are clean, the tests are green"
  console.log('Lines are clean, the tests are green');
  // Say "We ship this rock tonight!"
  console.log('We ship this rock tonight!');

  // The Coder gazed upon the code — The Coder said "It is good"
  refactored.gazed = true;
  console.log('It is good');

  // The dream is alive — The bug is gone
  console.log('The dream is alive');
  console.log('The bug is gone');

  // Everybody wants to code like a rockstar — But only those who slay the shadows truly rock
  return 'But only those who slay the shadows truly rock';
};
