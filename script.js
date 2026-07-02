const form = document.getElementById("appointmentForm");
const message = document.getElementById("formMessage");

function showMessage(text, color) {
  message.textContent = text;
  message.style.color = color;
}

function getSavedAppointments() {
  const savedAppointments = localStorage.getItem("mediconnectAppointments");
  return savedAppointments ? JSON.parse(savedAppointments) : [];
}

function saveAppointment(appointment) {
  const appointments = getSavedAppointments();
  appointments.push(appointment);
  localStorage.setItem("mediconnectAppointments", JSON.stringify(appointments));
}

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const appointment = {
    district: document.getElementById("district").value.trim(),
    sector: document.getElementById("sector").value.trim(),
    cell: document.getElementById("cell").value.trim(),
    area: document.getElementById("area").value.trim(),
    fullName: document.getElementById("fullname").value.trim(),
    age: document.getElementById("age").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    date: document.getElementById("date").value,
    time: document.getElementById("time").value,
    reason: document.getElementById("reason").value.trim(),
    notes: document.getElementById("notes").value.trim()
  };

  if (
    !appointment.district ||
    !appointment.sector ||
    !appointment.cell ||
    !appointment.area ||
    !appointment.fullName ||
    !appointment.age ||
    !appointment.phone ||
    !appointment.date ||
    !appointment.time ||
    !appointment.reason
  ) {
    showMessage("Please fill in all required fields.", "#b00020");
    return;
  }

  if (Number(appointment.age) < 1 || Number(appointment.age) > 120) {
    showMessage("Please enter a valid age between 1 and 120.", "#b00020");
    return;
  }

  saveAppointment(appointment);
  showMessage("Appointment request submitted successfully.", "#0b7f86");
  form.reset();
});
