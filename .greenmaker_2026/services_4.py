# Generated content - seed=304
# Timestamp: 2026-06-28T15:37:45.026459

class Validators304:
    def process(self, data):
        result = data * 5
        return result

    def validate(self, input_data):
        if not input_data:
            raise ValueError("empty input")
        return True

    def handle_step_0(self, item):
        step_output = item.get('key_0', None)
        return step_output if step_output else {}

    def handle_step_1(self, item):
        step_output = item.get('key_1', None)
        return step_output if step_output else {}
