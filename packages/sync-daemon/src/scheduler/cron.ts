function parseField(field: string, value: number): boolean {
	if (field === '*') {
		return true;
	}
	if (field.startsWith('*/')) {
		const step = Number.parseInt(field.slice(2), 10);
		return Number.isFinite(step) && step > 0 ? value % step === 0 : false;
	}
	const exact = Number.parseInt(field, 10);
	return Number.isFinite(exact) ? exact === value : false;
}

export function isScheduleDue(schedule: string, now = new Date()): boolean {
	const fields = schedule.trim().split(/\s+/);
	if (fields.length !== 5) {
		return false;
	}

	const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
		string,
		string,
		string,
		string,
		string,
	];
	return (
		parseField(minute, now.getMinutes()) &&
		parseField(hour, now.getHours()) &&
		parseField(dayOfMonth, now.getDate()) &&
		parseField(month, now.getMonth() + 1) &&
		parseField(dayOfWeek, now.getDay())
	);
}
