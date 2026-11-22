set -e
S=/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/people; T=/Users/emil2ka/Desktop/projects/memory-book/tools/people
K=$1; shift
cd /Users/emil2ka/Desktop/projects/memory-book/assets/_raw/world
node $T/splice_rigid.mjs $K.glb ${K}_v4.glb "$@"
npx -y @gltf-transform/cli@4.5.1 webp ${K}_v4.glb .tmp_p.glb --quality 82 >/dev/null 2>&1
npx -y @gltf-transform/cli@4.5.1 meshopt .tmp_p.glb ${K}_v4_packed.glb --level medium 2>&1 | tail -1
rm -f .tmp_p.glb
cp ${K}_v4_packed.glb ../../models/world/$K.glb
