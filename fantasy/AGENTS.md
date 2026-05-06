NEVER run a command throw away most of it's output by immediately piping to
grep, head, or similar. You can pipe to tee to save the full log and then
pipe to something to reduce immediate output.

REALLY. NEVER. Certainly not on a command that makes live LLM calls.
