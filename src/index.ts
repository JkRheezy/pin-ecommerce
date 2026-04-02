/**
 * {{projectName}}
 * {{projectDescription}}
 */

export function main(): void {
  console.log(`🚀 {{projectName}} is running!`);
}

if (require.main === module) {
  main();
}
