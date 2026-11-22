set -e
S=/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/people; T=/Users/emil2ka/Desktop/projects/memory-book/tools/people
cd /Users/emil2ka/Desktop/projects/memory-book
node $T/splice.mjs assets/_raw/world/fp_arms.glb $S/blender_arms.glb assets/_raw/world/fp_arms_v4.glb fp_hands,sleeves_boy,sleeves_girl
cd assets/_raw/world
npx -y @gltf-transform/cli@4.5.1 webp fp_arms_v4.glb .tmp_b.glb --quality 86 >/dev/null 2>&1
npx -y @gltf-transform/cli@4.5.1 meshopt .tmp_b.glb fp_arms_v4_packed.glb --level medium 2>&1 | tail -1
rm -f .tmp_b.glb
cp fp_arms_v4_packed.glb ../../models/world/fp_arms.glb
