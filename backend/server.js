const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("./db");
const Encryption = require("./aes");
const cookieParser = require("cookie-parser");
const { hashPassword } = require("./utils/password");
const { verifyPassword } = require("./utils/password");
const { generateToken } = require("./utils/jwt");
const authMiddleware = require("./middleware/authMiddleware");
const { json } = require("stream/consumers");
const session = require("express-session");
const nodemailer = require("nodemailer");
// for env variables
require('dotenv').config();


const app = express();
app.set("view engine", "ejs");
app.set("views", "views");
app.use(
  session({
    secret: "medicalsoftwaresecretkey",   
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
  })
);

const PORT = 5000;
const db = new Database("medical");
const encryption = new Encryption();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


app.use(express.static(path.join(__dirname, "public")));


app.post("/api/register", (req, res) => {
  const { doctor_id, password } = req.body;
  console.log(doctor_id, password);
  res.json({ message: "Doctor registered successfully" });
});

/* ✅ Serve HTML page */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "about.html"));
});

app.get("/service", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "contact.html"));
});

app.get("/doctor_portal", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor_portal.html"));
});

app.get("/clinic_portal", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "clinic_portal.html"));
});

app.get("/patient_portal", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "patient_portal.html"));
});



app.post("/api/doctor/register", async (req, res) => {
  const { doctor_id, password } = req.body;
  console.log("REGISTER:", doctor_id, password);

  const sql = "select * from doctor_login where doctor_id = ?"
  const user = await db.fetchData(sql, [doctor_id]);
  if(user){ return res.json({ success: false, message: "User Exists Try login!" }); } 
  
  const hashedPassword = await hashPassword(password);
  const insert_sql = "insert into doctor_login (doctor_id, password) values(?, ?)"
  const success = await db.insertData(insert_sql, [doctor_id, hashedPassword]);
  if (!success) {
    return res.status(500).json({ message: "Registration failed" });
  }
  res.json({ message: "Account created successfully" });
});


app.post("/api/clinic/register", async (req, res) => {
  const { hname, mail, password } = req.body;
  console.log("REGISTER:", hname, mail, password);

  const check_sql = "SELECT * FROM clinic_login WHERE mail = ?";
  const user = await db.fetchData(check_sql, [mail]);

  if (user) {
    return res.json({
      success: false,
      message: "Clinic Already Exists for the Given Mail, Try login!"
    });
  }

  const hashedPassword = await hashPassword(password);

  let hid;
  let inserted = false;
  while (!inserted) {
    try {
      hid = await create_hospital_id(hname);
      console.log("Generated Hospital ID:", hid);

      const insert_sql = `
        INSERT INTO clinic_login (hospital_id, hospital_name, mail, password)
        VALUES (?, ?, ?, ?)
      `;

      await db.insertData(insert_sql, [hid, hname, mail, hashedPassword]);

      inserted = true; 
    } 
    catch (err) {
      console.error("Insert error:", err.message);

      if (err.message.includes("Duplicate")) {
        console.log("Duplicate hospital_id, retrying...");
        continue;
      } 
      else {
        return res.status(500).json({
          success: false,
          message: "Registration failed",
          error: err.message
        });
      }
    }
  }

  try {
    const subject = "Med Link Clinic Registration Successful!";
    const body = `Your Clinic ID is: ${hid}`;

    await send_mail(subject, body, mail); 
    console.log("Email sent to:", mail);
  } 
  catch (mailErr) {
    console.error("Email failed:", mailErr.message);
  }

  return res.json({
    success: true,
    message: "Account created successfully",
    hospital_id: hid
  });
});


app.post("/api/patient/register", async (req, res) => {
  const { Aadhaar, pwd } = req.body;
  console.log("REGISTER:", Aadhaar, pwd);

  const sql = "select * from patient_login where unique_id = ?"
  const user = await db.fetchData(sql, [Aadhaar]);
  if(user){ return res.json({ success: false, message: "User Already Exists, Try login!" }); } 
  
  const hashedPassword = await hashPassword(pwd);
  const insert_sql = "insert into patient_login (unique_id, password) values(?, ?)"
  const success = await db.insertData(insert_sql, [Aadhaar, hashedPassword]);
  if (!success) {
    return res.status(500).json({ message: "Registration failed" });
  }
  res.json({
    success: true,
    message: "Account created successfully",
    redirect: "/patient_portal"
  });
});



app.post("/api/doctor/login", async (req, res) => {
  console.log("DOCTOR LOGIN API HIT");

  try {
    const { doctor_id, password } = req.body;
    console.log("REGISTER:", doctor_id, password);

    const sql = "SELECT * FROM doctor_login WHERE doctor_id = ?";
    const user = await db.fetchData(sql, [doctor_id]);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No User Found!",
        redirectUrl: "/doctor_portal"
      });
    }

    const isMatch = await verifyPassword(password, user.password);

    if (!isMatch) {
      console.log("❌ Password mismatch for doctor:", doctor_id);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials!",
        redirectUrl: "/doctor_portal"
      });
    }

    console.log("✅ Doctor authenticated successfully:", doctor_id);

    const token = generateToken({
      id: doctor_id,
      role: "doctor"
    });

    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: "Login successful",
      redirectUrl: "/dashboard"
    });

  } catch (err) {
    console.error("DOCTOR LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      redirectUrl: "/doctor_portal"
    });
  }
});


app.post("/api/clinic/login", async (req, res) => {
  console.log("CLINIC LOGIN API HIT");

  try {
    const { hid, pwd } = req.body;
    console.log("REGISTER:", hid, pwd);

    const sql = "SELECT * FROM clinic_login WHERE hospital_id = ?";
    const user = await db.fetchData(sql, [hid]);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No User Found!",
        redirectUrl: "/clinic_portal"
      });
    }

    const isMatch = await verifyPassword(pwd, user.password);

    if (!isMatch) {
      console.log("❌ Password mismatch for clinic:", hid);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials!",
        redirectUrl: "/clinic_portal"
      });
    }

    console.log("✅ Clinic authenticated successfully:", hid);

    const token = generateToken({
      id: hid,
      role: "clinic"
    });

    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: "Login successful",
      redirectUrl: "/dashboard"
    });

  } catch (err) {
    console.error("CLINIC LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      redirectUrl: "/clinic_portal"
    });
  }
});



app.post("/api/patient/login", async (req, res) => {

  console.log("PATIENT LOGIN API HIT");

  try {

    const { unique_id, pwd } = req.body;
    console.log("REGISTER:", unique_id, pwd);

    const sql = "select * from patient_login where unique_id = ?";
    const user = await db.fetchData(sql, [unique_id]);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No User Found!",
        redirectUrl: "/patient_portal"
      });
    }

    const isMatch = await verifyPassword(pwd, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials!",
        redirectUrl: "/patient_portal"
      });
    }

    const token = generateToken({
      id: unique_id,
      role: "patient"
    });

    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: "Login successful",
      redirectUrl: "/dashboard"
    });

  } catch (err) {
    console.error("PATIENT LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
      redirectUrl: "/patient_portal"
    });
  }
});


app.get("/dashboard", authMiddleware, (req, res) => {
  console.log(req.user);
  res.render("dashboard", { user: req.user.role, notification_count: 0 });
});


app.post("/dashboard/action", authMiddleware, (req, res) => {  
  console.log("ACTION RECEIVED:", req.body.action);
  const { action } = req.body;

  if (action === "enter_details") { return res.redirect("/enter_patient_details"); }
  if (action === "view_details") { return res.redirect("/view_patient_record"); }
  if (action === "appointment") { return res.redirect("/make_appointment"); }
  if (action === "schedule") { return res.redirect("/schedule_appointment"); }
  if (action === "view_appointment") { return res.redirect("/view_appointment"); }  
  if (action === "treatment") { return res.redirect("/view_treatments"); } 
  if (action === "logout") {
    res.clearCookie("token");
    return res.redirect("/");
  }   
  res.redirect("/dashboard");
});


app.get("/redirect_profile", authMiddleware, (req, res) => {
  console.log(req.user);
  if(req.user.role == "patient"){ return res.redirect("/profile"); }
  if(req.user.role == "doctor"){ return res.redirect("/dr_profile"); }
  if(req.user.role == "clinic"){ return res.redirect("/clinic_profile"); }
});

app.get("/profile", authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  const message = req.cookies.flash;
  res.clearCookie("flash");
  if(!user_id){return res.redirect("/patient_portal")}
  const query =  "SELECT data, aes_key, nounce, tag FROM patient_login WHERE unique_id = ?"
  const result = await db.fetchData(query, [user_id])
  let personal_info = {};
  if(result && result.data){
    const iv   = result.nounce;
    const data = result.data;
    const tag  = result.tag;
    const key  = result.aes_key;

    console.log("DB types:",
      Buffer.isBuffer(result.data),
      Buffer.isBuffer(result.aes_key),
      Buffer.isBuffer(result.nounce),
      Buffer.isBuffer(result.tag)
    );
    const decrypted = encryption.decrypt(iv, data, tag, key);
    if (decrypted) {
        personal_info = JSON.parse(decrypted.toString());
        console.log("personal_info : ", personal_info)
      }
  }
  res.render("profile", { prfl_id: req.user.id, result: personal_info, message:message });
});

app.post("/profile/action", authMiddleware, async (req, res) => {
  const { action } = req.body;

  if (action == "submit") {

    let dataToEncrypt = { ...req.body };
    delete dataToEncrypt.action;

    const cleanedData = {};

    for (let key in dataToEncrypt) {
      let value = dataToEncrypt[key];

      // -------- FIX FOR YOUR CASE (",,") --------
      if (Array.isArray(value)) {
        // Convert array to string first, then split properly
        let joined = value.join("");          // [",,"] -> ",,"
        let parts = joined
          .split(",")                         // ",," -> ["", "", ""]
          .map(v => v.trim())                // trim each
          .filter(v => v.length > 0);        // remove empty strings

        if (parts.length === 0) continue;    // skip if empty after cleaning

        cleanedData[key] = parts;            // store cleaned array
        continue;
      }

      // If string, trim it
      if (typeof value === "string") {
        value = value.trim();
        if (!value) continue;                // skip empty strings
      }

      // Skip null or undefined
      if (value === null || value === undefined) continue;

      cleanedData[key] = value;
    }

    console.log("CLEANED DATA:", cleanedData);

    const encrypted = encryption.encrypt(JSON.stringify(cleanedData));

    if (!encrypted) {
      return res.status(500).json({
        success: false,
        message: "Error While Update Profile"
      });
    }

    const ivHex = encrypted.iv;
    const dataHex = encrypted.ciphertext;
    const tagHex = encrypted.tag;
    const keyHex = encrypted.key;

    const sql = `
      UPDATE patient_login 
      SET data = ?, aes_key = ?, nounce = ?, tag = ?
      WHERE unique_id = ?
    `;

    await db.insertData(sql, [
      dataHex,
      keyHex,
      ivHex,
      tagHex,
      req.user.id
    ]);

    res.cookie("flash", "Profile updated successfully", {
      maxAge: 5000,
      httpOnly: true
    });

    return res.redirect(303, "/profile");
  }
  else if (action == "back") {
    return res.redirect(303, "/dashboard");
  }
});



app.route("/dr_profile")
  .get(authMiddleware, async (req, res) => {
    console.log("Accessing Doctor Profile");

    const user_id = req.user.id;
    const js_alert = req.session.js_alert;
    delete req.session.js_alert;

    const clinic = await fetchHospitals();

    if (!user_id) {
      return res.redirect("/doctor_portal");
    }

    const query = "SELECT * FROM doctor_login WHERE doctor_id = ?";
    const result = await db.fetchData(query, [user_id]);

    let personal_info = {};

    if (result && result.data) {
      try {
        const decryptedBuffer = encryption.decrypt(
          result.nounce,   // nounce
          result.data,     // encrypted data
          result.tag,      // tag
          result.aes_key   // key
        );

        if (decryptedBuffer) {
          personal_info = JSON.parse(decryptedBuffer.toString());
          req.session.dr_prfl_result = personal_info;
        } else {
          console.log("Decryption returned null — using empty profile.");
        }
      } 
      catch (err) {
        console.error("Decryption Error (handled):", err.message);
        personal_info = {};   // IMPORTANT: prevent crash
      }
    } 
    else {
      console.log("No encrypted profile data found.");
    }

    console.log("Doctor Personal Info on prfl load:", personal_info);

    return res.render("dr_prfl", {
      prfl_id: user_id,
      result: personal_info,
      js_alert: js_alert || null,
      clinic
    });
  })

  .post(authMiddleware, async (req, res) => {
    console.log("Accessing Doctor Profile POST");

    const user_id = req.user.id;
    const clinic = await fetchHospitals();

    if (!user_id) {
      return res.redirect("/doctor_portal");
    }

    const action = req.body.action;
    console.log("Action in dr_profile:", action);

    if (action === "submit") {
      console.log("Doctor Profile Form Submitted");

      let data = { ...req.body };

      // handle multi-select
      data["available_days[]"] = req.body["available_days[]"] || [];

      const doctor_id = data.RegistrationID;
      const name = data.Name;
      const specialization = data.Specialization;
      const experience = data["Specialization Experience"];
      const mail = data.email;
      const hospital = data["current Hospital"];
      const hospital_id = data["Hospital Id"];
      const address = data.Hospital_address;

      console.log("Doctor ID:", doctor_id);
      console.log("hospital id :", hospital_id);
      console.log("Specialization:", specialization);
      console.log("Experience:", experience);
      console.log("Available Days:", data["available_days[]"]);

      // remove empty fields and action key
      data = Object.fromEntries(
        Object.entries(data).filter(
          ([k, v]) => v !== "" && v !== null && k !== "action"
        )
      );

      const json_data = JSON.stringify(data);
      console.log("Data to be inserted in Profile table:", json_data);

      const encrypted = encryption.encrypt(json_data);

      if (!encrypted) {
        req.session.js_alert = "Encryption failed";
        return res.redirect("/dr_profile");
      }

      const iv = encrypted.iv;
      const ciphertext = encrypted.ciphertext;
      const tag = encrypted.tag;
      const aes_key = encrypted.key;

      const query1 = `
        UPDATE doctor_login 
        SET data = ?, aes_key = ?, nounce = ?, tag = ?, mail = ?, hospital = ?, hospital_id = ?
        WHERE doctor_id = ?
      `;

      const prfl_update = await db.updateData(query1, [
        ciphertext,
        aes_key,
        iv,
        tag,
        mail,
        hospital,
        hospital_id,
        user_id
      ]);

      const query2 = `
        UPDATE doctor 
        SET doctor = ?, doctor_mail = ?, specialist = ?, experience = ?, 
            hospital = ?, hospital_address = ?, hospital_id = ?
        WHERE doctor_id = ?
      `;

      const doctor_update = await db.updateData(query2, [
        name,
        mail,
        specialization,
        experience,
        hospital,
        address,
        hospital_id,
        user_id
      ]);

      if (prfl_update && doctor_update) {
        req.session.js_alert = "Profile updated successfully!";
        return res.redirect("/dr_profile");
      } else {
        req.session.js_alert = "Error updating profile. Please try again.";
        return res.redirect("/dr_profile");
      }
    }

    if (action === "back") {
      return res.redirect("/dashboard");
    }

    return res.redirect("/dr_profile");
});


app.all("/clinic_profile", authMiddleware, async (req, res) => {
  console.log("Accessing clinic Profile");

  const user_id = req.user.id;   // FROM TOKEN
  const js_alert = req.session.js_alert || null;
  delete req.session.js_alert;

  // Fetch clinic name from DB (not from session)
  const clinicRow = await db.fetchData(
    "SELECT hospital_name FROM clinic_login WHERE hospital_id = ?",
    [user_id]
  );
  const hname = clinicRow ? clinicRow.hospital_name : "";

  let clinic_info = {};

  console.log("clinic ID in Profile:", user_id);

  if (!user_id) {
    return res.redirect("/clinic_portal");
  }

  // ✅ SAFE FIX: avoid crash when GET request
  const action = req.body ? req.body.action : null;
  console.log("Action in clinic_profile:", action);

  if (req.method === "POST") {

    if (action === "submit") {
      console.log("clinic Profile Form Submitted");

      let data = { ...req.body };

      data["working_days[]"] = req.body["working_days[]"] || [];

      // Remove empty values and 'action'
      Object.keys(data).forEach(key => {
        if (data[key] === "" || data[key] === null || key === "action") {
          delete data[key];
        }
      });

      const json_data = JSON.stringify(data);
      console.log("Data to be inserted in Profile table:", json_data);

      const encrypted = encryption.encrypt(Buffer.from(json_data));

      if (!encrypted) {
        req.session.js_alert = "Encryption failed";
        return res.redirect("/clinic_profile");
      }

      const { iv, ciphertext, tag, key } = encrypted;

      const updateQuery = `
        UPDATE clinic_login 
        SET data = ?, aes_key = ?, nounce = ?, tag = ?
        WHERE hospital_id = ?
      `;

      const values = [ciphertext, key, iv, tag, user_id];

      const prfl_update = await db.updateData(updateQuery, values);

      if (prfl_update) {
        req.session.js_alert = "Profile updated successfully!";
        return res.redirect("/clinic_profile");
      } else {
        req.session.js_alert = "Error updating profile. Please try again.";
        return res.redirect("/clinic_profile");
      }
    }

    if (action === "back") {
      return res.redirect("/dashboard");
    }
  }

  const query = "SELECT * FROM clinic_login WHERE hospital_id = ?";
  const result = await db.fetchData(query, [user_id]);

  console.log("result : ", result);

  if (result && result.data) {
    console.log("entered for decode result");

    const decrypted = encryption.decrypt(
      result.nounce,
      result.data,
      result.tag,
      result.aes_key
    );

    if (decrypted) {
      console.log("decode completed");
      clinic_info = JSON.parse(decrypted.toString());
      req.session.clinic_prfl_result = clinic_info;
    }
  }

  console.log("clinic Info on prfl load:", clinic_info);

  return res.render("clinic_profile", {
    js_alert,
    clinic_id: user_id,
    result: clinic_info,
    name: hname
  });
});



app.get("/enter_patient_details", authMiddleware, async (req, res) => {
  console.log(req.user);
  const user = req.user.role;
  const user_id = req.user.id;
  let patient_id = "";
  if(user == "patient"){ patient_id = req.user.id; }
  let hospital_name = ""
  if(user == "doctor"){
    const result = await hospital_details_for_doctor(user_id)
    if(result){ hospital_name = result.hospital; }     
  }
  if(user == "clinic"){ 
    const hospitals = await fetchHospitals();
    hospital_name = hospitals.find(h => h.hospital_id === user_id)?.hospital_name || null;

  }
  console.log("User role : ", user);
  console.log("Patient id : ", patient_id);
  res.render("enter_patient_details", { user_id: patient_id, hospital_name: hospital_name });
   
});

app.post("/enter_patient_details/action", authMiddleware, async(req, res) =>{
  const { action } = req.body;
  if(action == "next"){
    const hospital = req.body['hospital'];
    const patient_id = req.body['patient_id'];
    console.log("Patient id : ", patient_id);
    console.log("Hospital : ", hospital);
    req.session.patient_id = patient_id;
    req.session.hospital = hospital;
    const sql = `
            SELECT data, aes_key, nounce, tag
            FROM medical_record
            WHERE unique_id = ?
            AND hospital = ?
            AND visit_date = ?
            ORDER BY id DESC
            LIMIT 1 `;
    const today = new Date(); 
    const visit_date = today.toISOString().split('T')[0];
    console.log("visit_date :", visit_date);
    const result = await db.fetchData(sql, [patient_id, hospital, visit_date]);
    console.log("Fetched medical record");
    let payload = null;
    if(result){
      console.log("Record Found, Decrypting...");
      const iv   = result.nounce;
      const data = result.data;
      const tag  = result.tag;
      const key  = result.aes_key;
      const decrypted = encryption.decrypt(iv, data, tag, key);
      if (decrypted) {
        payload = JSON.parse(decrypted.toString());
        console.log("medical_info : ", payload)
      }
    } 
    return res.render("enter_issue", { patient_id: patient_id, hospital: hospital, payload: payload, appointment_id: null });
  }
  if(action == "back"){ return res.redirect(303,"/dashboard");}
});

app.get("/update_issue", authMiddleware, (req, res) => {
  console.log("entered update issue get route");
  let patient_id = req.session.patient_id;
  let hospital = req.session.hospital;
  let payload = null;
  const day = new Date(); 
  const today = day.toISOString().split('T')[0];
  console.log("today :", today);
  console.log("Patient id : ", patient_id);
  console.log("Hospital : ", hospital);

  return res.render("enter_issue", { patient_id: patient_id, hospital: hospital, payload: payload, appointment_id: null });
});

app.post("/update_issue/action", authMiddleware, async (req, res) => {
  const { action } = req.body;

  if (action === "submit") {
    const hospital = req.body.hospital;
    const patient_id = req.body.patientId;
    const appointment_id = req.body.appointmentId || null;

    const today = new Date().toISOString().split("T")[0];

    const query1 = `
      SELECT id, data, aes_key, nounce, tag
      FROM medical_record
      WHERE unique_id = ?
        AND hospital = ?
        AND visit_date = ?
      ORDER BY id DESC
      LIMIT 1
    `;

    const existing = await db.fetchData(query1, [patient_id, hospital, today]);

    const temperatures = req.body["temperature[]"] || [];
    const bps = req.body["bp[]"] || [];
    const pulses = req.body["pulse[]"] || [];
    const spo2s = req.body["spo2[]"] || [];
    const weights = req.body["weight[]"] || [];
    const blood_sugars = req.body["blood_sugar[]"] || [];
    const pains = req.body["pain[]"] || [];
    const remarks_list = req.body["remarks[]"] || [];
    const nurse_names = req.body["nurse_name[]"] || [];
    const timestamps = req.body["timestamp[]"] || [];

    const incoming_readings = [];

    for (let i = 0; i < temperatures.length; i++) {
      incoming_readings.push({
        timestamp:
          timestamps[i] ||
          new Date().toISOString().replace("T", " ").slice(0, 19),
        temperature: temperatures[i],
        bp: bps[i],
        pulse: pulses[i],
        spo2: spo2s[i],
        weight: weights[i],
        blood_sugar: blood_sugars[i],
        pain: pains[i],
        remarks: remarks_list[i],
        nurse_name: nurse_names[i],
      });
    }

    const doctor_entry = {
      diseaseName: req.body.diseaseName,
      allergies: req.body.allergies,
      reasonVisit: req.body.reasonVisit,
      currentMeds: req.body.currentMeds,
      treatedBy: req.body.treatedBy,
    };

    let payload = null;

    if (existing) {
      console.log("Existing record found — updating...");

      const record_id = existing.id;
      const iv = existing.nounce;
      const data = existing.data;
      const tag = existing.tag;
      const key = existing.aes_key;

      const decrypted = encryption.decrypt(iv, data, tag, key);

      if (!decrypted) {
        return res.status(500).json({
          success: false,
          message: "Decryption failed",
        });
      }

      payload = JSON.parse(decrypted);

      const existing_ts = new Set(
        (payload.nurse_entries || []).map((r) => r.timestamp)
      );

      incoming_readings.forEach((r) => {
        if (!existing_ts.has(r.timestamp)) {
          payload.nurse_entries.push(r);
        }
      });

      payload.doctor_entry = doctor_entry;

      const new_json = JSON.stringify(payload);

      const encrypted = encryption.encrypt(new_json);

      const ivHex = encrypted.iv;
      const dataHex = encrypted.ciphertext;
      const tagHex = encrypted.tag;
      const keyHex = encrypted.key;

      const update_q = `
        UPDATE medical_record
        SET data = ?, aes_key = ?, nounce = ?, tag = ?
        WHERE id = ?
      `;

      await db.updateData(update_q, [
        dataHex,
        keyHex,
        ivHex,
        tagHex,
        record_id,
      ]);

      req.session.js_alert = "details updated successfully!";
    } 
    else {
      console.log("No existing record — inserting new...");

      payload = {
        nurse_entries: incoming_readings,
        doctor_entry: doctor_entry,
      };

      const json_data = JSON.stringify(payload);
      const encrypted = encryption.encrypt(json_data);

      const ivHex = encrypted.iv;
      const dataHex = encrypted.ciphertext;
      const tagHex = encrypted.tag;
      const keyHex = encrypted.key;

      const insert_q = `
        INSERT INTO medical_record
        (unique_id, data, aes_key, nounce, tag, hospital, visit_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await db.insertData(insert_q, [
        patient_id,
        dataHex,
        keyHex,
        ivHex,
        tagHex,
        hospital,
        today,
      ]);

      req.session.js_alert = "details submitted successfully!";

      if (appointment_id) {
        console.log("Appointment found:", appointment_id);

        const update_app = `
          UPDATE appointment
          SET status = 'REVIEWED'
          WHERE id = ?
        `;
        await db.updateData(update_app, [appointment_id]);

        req.session.js_alert = "Appointment reviewed!";
      }
    }

    if (req.user.role === "doctor") {
      return res.redirect("/enter_patient_details");
    } else {
      return res.redirect("/dashboard");
    }
  }
  if (action === "back") { res.redirect(303, "/enter_patient_details"); }
});


app.get("/view_patient_record", authMiddleware, async (req, res) => {
  console.log("Entered view patient record route");

  const user = req.user.role;
  let results = null;
  let search_id = null;
  let show_view_patient = false;

  console.log("user:", user);

  if (user === "patient") {
    search_id = req.user.id;
    show_view_patient = true;

    const query = `SELECT * FROM medical_record WHERE unique_id = ?`;
    const records = await db.fetchAllData(query, [search_id]);

    console.log("Fetched records:", records.length);

    let decrypted_results = [];

    for (const r of records) {
      // Adjust these field names to match your DB column names
      console.log("entered for loop")
      const iv = r.nounce;
      const data = r.data;
      const tag = r.tag;
      const key = r.aes_key;
      
      console.log("DB types:",
        Buffer.isBuffer(r.data),
        Buffer.isBuffer(r.aes_key),
        Buffer.isBuffer(r.nounce),
        Buffer.isBuffer(r.tag)
      );

      const decrypted = encryption.decrypt(iv, data, tag, key);

      if (!decrypted) {
        console.error("Decryption failed for record:", r.id);
        continue;
      }

      const payload = JSON.parse(decrypted);

      decrypted_results.push({
        id: r.id,
        hospital: r.hospital,
        visit_date: r.visit_date,
        doctor: payload.doctor_entry || {},
        nurse_entries: payload.nurse_entries || []
      });
    }

    results = decrypted_results;
  }

  res.render("View_Patient_record", {
    results,
    searched_patient_id: search_id,
    view_patient: show_view_patient,
    user
  });
});

app.post("/view_patient_record/action", authMiddleware, async (req, res) => {
  const { action } = req.body;

  let results = null;
  let search_id = null;
  let show_view_patient = false;

  if (action === "search") {
    search_id = req.body["searchId"];

    const query = `SELECT * FROM medical_record WHERE unique_id = ?`;
    const records = await db.fetchAllData(query, [search_id]);

    const vquery = `SELECT * FROM patient_login WHERE unique_id = ?`;
    const view_patient = await db.fetchData(vquery, [search_id]);

    show_view_patient = Boolean(view_patient);

    let decrypted_results = [];

    for (const r of records) {
      const iv = r.nounce;
      const data = r.data;
      const tag = r.tag;
      const key = r.aes_key;

      const decrypted = encryption.decrypt(iv, data, tag, key);

      if (!decrypted) {
        console.error("Decryption failed for record:", r.id);
        continue;
      }

      const payload = JSON.parse(decrypted);

      decrypted_results.push({
        id: r.id,
        hospital: r.hospital,
        visit_date: r.visit_date,
        doctor: payload.doctor_entry || {},
        nurse_entries: payload.nurse_entries || []
      });
    }

    results = decrypted_results;
  }

  else if (action === "back") {
    return res.redirect("/dashboard");
  }

  return res.render("View_Patient_record", {
    results,
    searched_patient_id: search_id,
    user: req.user.role,
    view_patient: show_view_patient
  });
});

app.get("/view_patient", authMiddleware, (req, res) => {
  console.log("Accessing view_patient route (GET)");

  const data = req.session.view_patient;

  if (!data) {
    console.log("No session data — redirecting");
    return res.redirect("/view_patient_record");
  }

  console.log("Patient Detail from Session:", data);

  return res.render("View_Patient_Details", {
    personal: data.personal,
    visit: data.visit
  });
});

app.post("/view_patient/action", authMiddleware, async (req, res) => {
  console.log("Accessing view_patient route (POST)");

  const record_id = req.body.rid;
  console.log("Record ID:", record_id);

  const query = `
    SELECT 
      p.data   AS p_data,
      p.nounce AS p_nounce,
      p.tag    AS p_tag,
      p.aes_key AS p_key,

      m.data   AS m_data,
      m.nounce AS m_nounce,
      m.tag    AS m_tag,
      m.aes_key AS m_key,

      m.hospital,
      m.visit_date
    FROM medical_record m
    JOIN patient_login p 
      ON p.unique_id = m.unique_id
    WHERE m.id = ?
  `;

  const row = await db.fetchData(query, [record_id]);

  if (!row) {
    console.log("No record found");
    return res.redirect("/view_patient_record");
  }

  // ---------- Decrypt patient profile ----------
  const personal_info = JSON.parse(
    encryption.decrypt(
      row.p_nounce,
      row.p_data,
      row.p_tag,
      row.p_key
    )
  );

  // ---------- Decrypt medical visit ----------
  const medical_payload = JSON.parse(
    encryption.decrypt(
      row.m_nounce,
      row.m_data,
      row.m_tag,
      row.m_key
    )
  );

  const visit = {
    hospital: row.hospital,
    visit_date: row.visit_date,
    doctor: medical_payload.doctor_entry || null,
    nurse_entries: medical_payload.nurse_entries || []
  };

  // Store in session (same as Flask)
  req.session.view_patient = {
    personal: personal_info,
    visit: visit
  };

  return res.redirect("/view_patient");
});

app.get("/view_patient_profile", authMiddleware, (req, res) => {
  console.log("Accessing view_patient_profile route (GET)");

  const profile = req.session.patient_profile;
  console.log("patient profile info:", profile);

  if (!profile) {
    return res.redirect("/view_patient_record");
  }

  return res.render("View_Patient_prfl", { result: profile });
});

app.post("/view_patient_profile/action", authMiddleware, async (req, res) => {
  console.log("Accessing view_patient_profile route (POST)");

  const patient_id = req.body.patient_id;
  console.log("Patient ID:", patient_id);

  const query = `
    SELECT data, nounce, tag, aes_key
    FROM patient_login
    WHERE unique_id = ?
  `;

  const row = await db.fetchData(query, [patient_id]);

  if (!row) {
    // you don’t have flash in Node, so use a cookie or session message
    res.cookie("flash", "Patient profile not found", { maxAge: 5000, httpOnly: true });
    return res.redirect("/view_patient_record");
  }

  const iv = row.nounce;
  const data = row.data;
  const tag = row.tag;
  const key = row.aes_key;

  const decrypted = encryption.decrypt(iv, data, tag, key);

  if (!decrypted) {
    console.error("Profile decryption failed");
    res.cookie("flash", "Profile decryption failed", { maxAge: 5000, httpOnly: true });
    return res.redirect("/view_patient_record");
  }

  const personal_info = JSON.parse(decrypted.toString());

  // Store in session (same idea as Flask)
  req.session.patient_profile = personal_info;

  return res.redirect("/view_patient_profile");
});

app.get("/return_search", authMiddleware, (res, req) => {
  return res.redirect("/view_patient_record");
});

app.get("/make_appointment", authMiddleware, async (req, res) => {
  console.log("Accessing make_appointment route");

  const alert = req.session.alert || null;
  delete req.session.alert;

  let doctors = [];
  try {
    doctors = await fetch_doctors();
  } catch (err) {
    console.error("Error fetching doctors:", err);
  }

  return res.render("make_appointment", {
    alert: alert,
    results: doctors
  });
});

app.post("/make_appointment/action", authMiddleware, async (req, res) => {
  console.log("Accessing make_appointment POST");

  const form_data = { ...req.body };
  const doctor_id = form_data.doctor;
  const patient_id = req.user.id;

  console.log("Appointment JSON Data:", form_data);

  const json_data = JSON.stringify(form_data);
  const encrypted = encryption.encrypt(json_data);

  if (!encrypted) {
    return res.status(500).json({
      success: false,
      message: "Encryption failed",
    });
  }

  const iv = encrypted.iv;
  const ciphertext = encrypted.ciphertext;
  const tag = encrypted.tag;
  const aes_key = encrypted.key;

  console.log("Inserting appointment notification...");

  const insert_notification = `
    INSERT INTO notification 
    (doctor_id, patient_id, msg, nounce, aes_key, tag) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  await db.insertData(insert_notification, [
    doctor_id,
    patient_id,
    ciphertext,
    iv,
    aes_key,
    tag,
  ]);

  console.log("Notification inserted");

  const appointment_datetime = `${form_data.appointment_date} ${form_data.appointment_time}:00`;

  const insert_appointment = `
    INSERT INTO appointment 
    (doctor_id, hospital_id, patient_name, patient_id, appointment, status, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await db.insertData(insert_appointment, [
    doctor_id,
    form_data.hospital,          
    form_data.patient_name,      
    patient_id,                  
    appointment_datetime,         
    "BOOKED",                   
    form_data.Reason_for_visit, 
  ]);

  console.log("Appointment inserted");

  // Set alert message for UI
  req.session.alert = "Appointment request sent successfully!";

  return res.redirect("/make_appointment");
});



app.get("/schedule_appointment", authMiddleware, async (req, res) => {
  console.log("schedule appointment");

  const user_type = req.user.role;
  const user_id = req.user.id;   // doctor_id or clinic_id from token

  console.log("user_type:", user_type);
  console.log("token user_id:", user_id);

  let js_alert = req.session.js_alert || null;
  delete req.session.js_alert;

  let details = null;
  let clinic = null;
  let doctors = [];

  try {

    // ================= DOCTOR LOGIN =================
    if (user_type === "doctor") {
      console.log("Fetching doctor details using token doctor_id...");

      // Get doctor details (this contains hospital id)
      details = await fetch_doctor_clinic(user_id);
      console.log("doctor_details:", details);

      const hid = details?.hospital;  // <-- IMPORTANT FIX

      if (!hid) {
        console.error("Hospital ID missing for doctor!");
      } else {
        clinic = await db.fetchData(
          "SELECT hospital, hospital_address FROM doctor WHERE hospital_id = ?",
          [hid]
        );

        doctors = await fetch_doctors_hospital(hid);
      }
    }

    // ================= CLINIC LOGIN =================
    else if (user_type === "clinic") {
      console.log("Clinic login detected, using token id as hospital_id");

      const hid = user_id;  

      clinic = await db.fetchData(
        "SELECT hospital, hospital_address FROM doctor WHERE hospital_id = ?",
        [hid]
      );

      doctors = await fetch_doctors_hospital(hid);
    }

    console.log("clinic:", clinic);
    console.log("doctors:", doctors);

    return res.render("schedule_appointment", {
      results: doctors || [],
      clinic: clinic || {},
      js_alert: js_alert,
      user: user_type,
      details: details || {}
    });

  } catch (err) {
    console.error("Error in schedule_appointment GET:", err);
    res.status(500).send("Server error");
  }
});


app.post("/schedule_appointment/action", authMiddleware, async (req, res) => {
  console.log("POST schedule appointment");

  const user_id = req.user.id;
  const user_type = req.user.role;

  const form_data = { ...req.body };
  const appointment_id = req.body.appointment_id || null;
  const doctor_id = req.body.doctor;
  const patient_id = req.body.id;
  const patient_name = req.body.patient_name;
  const appointment_date = req.body.appointment_date;
  const appointment_time = req.body.appointment_time;
  const reason = req.body.Reason_for_visit;

  const appointment_datetime = `${appointment_date} ${appointment_time}:00`;

  console.log("Appointment JSON Data:", form_data);

  let js_alert = "";

  if (appointment_id) {
    console.log("Rescheduling appointment...");

    const update_query = `
      UPDATE appointment 
      SET appointment = ?, status = ?
      WHERE id = ?
    `;

    const result = await db.updateData(update_query, [
      appointment_datetime,
      "REASSIGNED",
      appointment_id,
    ]);

    js_alert = result
      ? "Appointment Updated successfully!"
      : "Error While Updating Appointment";
  } 
  else {
    console.log("Creating new appointment...");
    let hid = null;

    if (user_type === "clinic") {
      hid = user_id;   
    } 
    else if (user_type === "doctor") {
      const d = await fetch_doctor_clinic(user_id);
      hid = d?.hospital;
    }

    if (!hid) {
      req.session.js_alert = "Hospital ID missing!";
      return res.redirect("/schedule_appointment");
    }

    const insert_appointment = `
      INSERT INTO appointment 
      (doctor_id, hospital_id, patient_name, patient_id, appointment, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await db.insertData(insert_appointment, [
      doctor_id,
      hid,
      patient_name,
      patient_id,
      appointment_datetime,
      reason,
    ]);

    // ======= ALSO INSERT INTO NOTIFICATION =======
    if (result) {
      const json_data = JSON.stringify(form_data);
      const encrypted = encryption.encrypt(json_data);

      if (encrypted) {
        const insert_notification = `
          INSERT INTO notification 
          (doctor_id, patient_id, msg, nounce, aes_key, tag)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        await db.insertData(insert_notification, [
          doctor_id,
          patient_id,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.key,
          encrypted.tag,
        ]);

        console.log("Notification inserted");
      }
    }

    js_alert = result
      ? "Appointment created successfully!"
      : "Error While Creating Appointment";
  }

  req.session.js_alert = js_alert;
  return res.redirect("/schedule_appointment");
});


app.get("/view_appointment", authMiddleware, async (req, res) => {
  console.log("enter view appointment");

  const user_type = req.user.role;  
  let alert = req.session.js_alert || null;
  delete req.session.js_alert;

  let results = [];
  let doctors = [];
  let doctor_map = {};
  let doctor_details = null;

  try {
    if (user_type === "clinic") {
      console.log("user type clinic");

      const user_id = req.user.id; 

      results = await fetch_appointments(user_id);
      doctors = await fetch_doctors_for_hosp(user_id);

      // create doctor_map { doctor_id : doctor_name }
      doctor_map = {};
      doctors.forEach(d => {
        doctor_map[d[1]] = d[2];
      });
    }

    if (user_type === "doctor") {
      console.log("user type doctor");

      const user_id = req.user.id;

      results = await fetch_appointments_for_doctor(user_id);
      doctor_details = await fetch_doctor_clinic(user_id);
      console.log("doctor_details:", doctor_details);
    }

    // Fetch counts (same as your Flask)
    let { total_count, doctor_count } = await fetch_appointment_counts();

    if (doctor_count) {
      const cleaned = {};
      for (let [k, v] of Object.entries(doctor_count)) {
        if (k !== null && k !== undefined) {
          cleaned[parseInt(k)] = parseInt(v);
        }
      }
      doctor_count = cleaned;
    }

    console.log("RAW RESULTS FROM DB:", results);


    res.render("view_appointment", {
      results,
      doctors,
      doctor_map,
      alert,
      count: total_count,
      doctor_count,
      user: user_type,
      details: user_type === "doctor" ? doctor_details : []
    });

  } catch (err) {
    console.error("Error in view_appointment GET:", err);
    res.status(500).send("Server error");
  }
});

app.post("/view_appointment/action", authMiddleware, async (req, res) => {
  console.log("POST /view_appointment");

  const action = req.body.action;
  const appointment_id = req.body.appointment_id;
  const user_type = req.user.role;
  const user_id = req.user.id;

  try {
    if (action === "reschedule") {
      console.log("work with reschedule");

      const appointment = await db.fetchData(
        "SELECT id, doctor_id, patient_name, patient_id, appointment, reason FROM appointment WHERE id = ?",
        [appointment_id]
      );

      const clinic = await db.fetchData(
        "SELECT hospital, hospital_address FROM doctor WHERE hospital_id = ?",
        [user_id]
      );

      if (!appointment) {
        req.session.js_alert = "Appointment not found";
        return res.redirect("/view_appointment");
      }

      let doctors = [];
      if (user_type === "clinic") {
        doctors = await fetch_doctors_for_hosp(user_id);
      }

      let doctor_details = null;
      if (user_type === "doctor") {
        doctor_details = await fetch_doctor_clinic(user_id);
      }

      return res.render("schedule_appointment", {
        reschedule: true,
        appointment,
        results: doctors,
        clinic,
        user: user_type,
        details: user_type === "doctor" ? doctor_details : []
      });
    }

    else if (action === "finished") {
      console.log("work with finished");

      const patient_id = req.body.patient_id;

      const row = await db.fetchData(
        "SELECT hospital FROM doctor WHERE doctor_id = ?",
        [user_id]
      );

      const clinic = row ? row.hospital : null;

      console.log(
        `appointment id : ${appointment_id}, Patient_id : ${patient_id}, clinic name : ${clinic}`
      );

      return res.render("enter_issue", {
        hospital: clinic,
        patient_id,
        appointment_id,
        payload: {}
      });
    }

    else if (action === "cancel") {
      console.log("work with cancel");

      const status = "CANCELLED";
      console.log("appointment id :", appointment_id);

      const result = await update_appointment_status(appointment_id, status);

      if (result) {
        req.session.js_alert = `Appointment ${status.toLowerCase()} successfully`;
      }

      return res.redirect("/view_appointment");
    }

    res.redirect("/view_appointment");

  } catch (err) {
    console.error("Error in view_appointment POST:", err);
    res.status(500).send("Server error");
  }
});


app.post("/change_doctor", authMiddleware, async (req, res) => {
  console.log("change doctor");

  try {
    const action = req.body.action;
    const new_doctor_id = req.body.doctor;
    let appointment_ids = req.body.appointment_ids;

    // When only one checkbox is selected, Express gives a string instead of array
    if (!Array.isArray(appointment_ids)) {
      appointment_ids = appointment_ids ? [appointment_ids] : [];
    }

    console.log("Selected appointments:", appointment_ids);
    console.log("New doctor:", new_doctor_id);

    if (!new_doctor_id || appointment_ids.length === 0) {
      req.session.js_alert = "Please select appointments and a doctor";
      return res.redirect("/view_appointment");
    }

    for (const appt_id of appointment_ids) {
      const patient_id = req.body[`patient_ids_${appt_id}`];

      console.log("Appointment:", appt_id, "Patient:", patient_id);

      const updateQuery = `
        UPDATE appointment 
        SET doctor_id = ?
        WHERE id = ?
      `;

      const result = await db.updateData(updateQuery, [
        new_doctor_id,
        appt_id,
      ]);

      if (!result) {
        req.session.js_alert = "Error While Changing Doctor";
        return res.redirect("/view_appointment");
      }
    }

    req.session.js_alert = "Doctor Changed For the Selected Appointments";
    return res.redirect("/view_appointment");

  } catch (err) {
    console.error("change_doctor error:", err);
    req.session.js_alert = "Server error while changing doctor";
    return res.redirect("/view_appointment");
  }
});


app.get("/view_treatments", authMiddleware, async (req, res) => {
  try {
    const hid = req.user.id;

    console.log("Hospital ID:", hid);
    const results = await fetch_treatments_done(hid);
    console.log("results:", results);

    const doctors = await fetch_doctors_for_hosp(hid);

    let doctor_map = {};
    doctors.forEach(d => {
      doctor_map[d[1]] = d[2];  
    });

    const { total_count, doctor_count } = await fetch_treatment_counts();

    console.log("total count:", total_count, "doctor count:", doctor_count);

    return res.render("view_treatment", {
      results,
      doctors,
      doctor_map,
      count: total_count,
      doctor_count
    });

  } catch (err) {
    console.error("Error in /view_treatments:", err);
    return res.status(500).send("Internal Server Error");
  }
});




app.get("/notifications", authMiddleware, async (req, res) => {
  const user = req.user.role;  
  console.log("Accessing Notifications for:", user);

  if (user === "doctor") {
    console.log("Accessing Doctor Notifications");

    const results = await check_notifications(req);
    const appointment = await check_appointments(req);

    if (appointment) {
      return res.render("dr_notification", {
        results,
        appointment
      });
    } else {
      return res.render("dr_notification", {
        results
      });
    }
  }

  if (user === "patient") {
    const patient_id = req.user.id;
    console.log("Patient ID:", patient_id);

    const first_visit_done = req.session.patient_notifications_visited || false;
    console.log("patient_notifications_visited:", first_visit_done);

    if (first_visit_done) {
      const update_query = `
        UPDATE notification
        SET seen = 1
        WHERE patient_id = ? 
        AND seen = 0 
        AND notification_status IS NOT NULL
      `;

      await db.updateData(update_query, [patient_id]);
    }

    const results = await check_patient_notifications(req);
    const appointment = await check_appointments(req);

    req.session.patient_notifications_visited = true;

    if (appointment) {
      return res.render("patient_notification", {
        results,
        appointment
      });
    } else {
      return res.render("patient_notification", {
        results
      });
    }
  }

  return res.status(403).send("Unauthorized");
});



app.get("/back", (req, res) =>{
  return res.redirect(303,"/dashboard");
});


// this function returns hospital name and id 
async function hospital_details_for_doctor(doctor_id){
  const sql = "Select hospital, hospital_id from doctor_login where doctor_id = ? "
  const result = await db.fetchData(sql , [doctor_id])
  return result
}

async function fetch_doctors() {
  console.log("entered fetch doctors");

  const query = "SELECT * FROM doctor";
  const query_results = await db.fetchAllData(query, []);

  console.log("query results :", query_results);

  let results = [];

  for (let doc of query_results) {
    let row = Object.values(doc);
    if (row[4]) {
      row[4] = row[4].trim().toLowerCase();
    } else {
      row[4] = "";
    }

    results.push(row);
  }

  return results;
}

async function fetch_doctors_for_hosp(hid) {
  const query = "SELECT * FROM doctor WHERE hospital_id = ?";
  const query_results = await db.fetchAllData(query, [hid]);

  let results = [];

  for (let doc of query_results) {
    let row = Object.values(doc);

    if (row[4]) {
      row[4] = row[4].trim().toLowerCase();
    } else {
      row[4] = "";
    }

    results.push(row);
  }

  return results;
}

async function fetch_doctors_hospital(hospital_id) {
  console.log("entered fetch doctors");
  console.log("hospital id :", hospital_id);

  const query = "SELECT * FROM doctor WHERE hospital_id = ?";
  const query_results = await db.fetchAllData(query, [hospital_id]);

  console.log("query results :", query_results);

  let results = [];

  for (let doc of query_results) {
    let row = Object.values(doc);

    if (row[4]) {
      row[4] = row[4].trim().toLowerCase();
    } else {
      row[4] = "";
    }

    results.push(row);
  }

  return results;
}

async function check_notifications(req) {
  if (req.user.role !== "doctor") return [];

  console.log("Accessing check_notifications for Doctor");

  const doctor_id = req.user.id;

  const query = `
    SELECT * 
    FROM notification 
    WHERE doctor_id = ? 
      AND notification_status IS NULL
  `;

  const results = await db.fetchAllData(query, [doctor_id]);
  console.log("Fetched Notifications:", results);

  let decrypted_results = [];

  for (const r of results) {
    try {
      const decrypted_json = encryption.decrypt(
        r.nounce,      // IV
        r.msg,         // encrypted data
        r.tag,         // auth tag
        r.aes_key      // key
      );

      if (!decrypted_json) continue;

      const message_data = JSON.parse(decrypted_json);

      decrypted_results.push({
        id: r.id,
        ...message_data
      });

    } catch (err) {
      console.error("Decryption failed for notification:", r.id);
    }
  }

  console.log("Decrypted Notifications:", decrypted_results);
  return decrypted_results;
}

async function check_patient_notifications(req) {
  if (req.user.role !== "patient") return [];

  const patient_id = req.user.id;

  const query = `
    SELECT * 
    FROM notification 
    WHERE patient_id = ?
      AND notification_status IS NOT NULL
    ORDER BY id DESC
  `;

  const results = await db.fetchAllData(query, [patient_id]);

  let decrypted_results = [];

  for (const r of results) {
    try {
      const decrypted_json = encryption.decrypt(
        r.nounce,
        r.msg,
        r.tag,
        r.aes_key
      );

      if (!decrypted_json) continue;

      const message_data = JSON.parse(decrypted_json);

      decrypted_results.push({
        id: r.id,
        seen: r.seen,
        notification_status: r.notification_status,
        ...message_data
      });

    } catch (err) {
      console.error("Decryption failed for notification:", r.id);
    }
  }

  console.log("Decrypted Patient Notifications:", decrypted_results);
  return decrypted_results;
}


async function check_appointments(req) {
  const today = new Date().toISOString().split("T")[0];
  const user_id = req.user.id;

  let query;

  if (req.user.role === "doctor") {
    query = `
      SELECT * 
      FROM notification 
      WHERE doctor_id = ?
        AND notification_status = 'Approved'
    `;
  } else {
    query = `
      SELECT * 
      FROM notification 
      WHERE patient_id = ?
        AND notification_status = 'Approved'
    `;
  }

  const results = await db.fetchAllData(query, [user_id]);

  let today_appointments = [];

  for (const r of results) {
    try {
      const decrypted_json = encryption.decrypt(
        r.nounce,
        r.msg,
        r.tag,
        r.aes_key
      );

      if (!decrypted_json) continue;

      const message_data = JSON.parse(decrypted_json);

      const appointment_date = message_data.appointment_date;
      if (!appointment_date) continue;

      if (appointment_date === today) {
        today_appointments.push({
          id: r.id,
          ...message_data
        });
      }

    } catch (err) {
      console.error("Decryption failed for appointment:", r.id);
    }
  }

  console.log("Today's Appointments:", today_appointments);
  return today_appointments;
}

async function fetch_appointments(hospital_id) {
  const query = `
    SELECT * 
    FROM appointment 
    WHERE hospital_id = ?
      AND status NOT IN ('REVIEWED', 'CANCELLED')
  `;

  return await db.fetchAllData(query, [hospital_id]);
}

async function fetch_appointments_for_doctor(doctor_id) {
  const query = `
    SELECT * 
    FROM appointment 
    WHERE doctor_id = ?
      AND status NOT IN ('REVIEWED', 'CANCELLED')
  `;

  return await db.fetchAllData(query, [doctor_id]);
}

app.post("/update_notification", authMiddleware, async (req, res) => {
  console.log("Accessing update_notification route");

  if (req.user.role !== "doctor") {
    return res.redirect("/dashboard");
  }

  const action = req.body.action;
  const notification_id = req.body.nid;

  console.log("Notification ID to Update:", notification_id);

  const query = `
    UPDATE notification 
    SET notification_status = ? 
    WHERE id = ?
  `;

  const status = action === "approve" ? "Approved" : "Rejected";

  await db.updateData(query, [status, notification_id]);

  return res.redirect("/dashboard");
});

app.post("/update_seen", authMiddleware, async (req, res) => {
  console.log("Accessing update_seen route");

  if (req.user.role !== "patient") {
    return res.redirect("/dashboard");
  }

  const notification_id = req.body.nid;
  console.log("Notification ID to Mark as Seen:", notification_id);

  const query = `
    UPDATE notification 
    SET seen = 1 
    WHERE id = ?
  `;

  await db.updateData(query, [notification_id]);

  return res.redirect("/dashboard");
});

async function create_hospital_id(hname) {
  const prefix = hname.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5);

  if (prefix.length < 3) {
    throw new Error("Hospital name must contain at least 3 letters");
  }

  const query = `
    SELECT hospital_id 
    FROM clinic_login 
    WHERE hospital_id LIKE ?
    ORDER BY hospital_id DESC 
    LIMIT 1
  `;

  const result = await db.fetchData(query, [`${prefix}-%`]);

  let next_number = 1;

  if (result && result.hospital_id) {
    const last_number = parseInt(result.hospital_id.split("-")[1]);
    next_number = last_number + 1;
  }

  const hospital_id = `${prefix}-${String(next_number).padStart(3, "0")}`;
  return hospital_id;
}

async function fetch_appointment_counts() {
  const total_query = `
    SELECT COUNT(*) AS total 
    FROM appointment 
    WHERE doctor_id IS NOT NULL
  `;

  const total_result = await db.fetchData(total_query);
  const total_count = total_result ? total_result.total : 0;

  const doctor_query = `
    SELECT doctor_id, COUNT(*) AS count
    FROM appointment 
    WHERE doctor_id IS NOT NULL
    GROUP BY doctor_id
  `;

  const doctor_results = await db.fetchAllData(doctor_query);

  let doctor_counts = {};
  for (const row of doctor_results) {
    doctor_counts[row.doctor_id] = row.count;
  }

  return { total_count, doctor_counts };
}

async function update_appointment_status(id, status) {
  const query = `
    UPDATE appointment 
    SET status = ? 
    WHERE id = ?
  `;

  const result = await db.updateData(query, [status, id]);
  return !!result;
}

async function fetch_treatments_done(hospital_id) {
  const query = `
    SELECT * 
    FROM appointment 
    WHERE status = 'REVIEWED'
      AND hospital_id = ?
  `;

  const results = await db.fetchAllData(query, [hospital_id]);
  return results || [];
}

async function fetch_treatment_counts() {
  const total_query = `
    SELECT COUNT(*) AS total 
    FROM appointment 
    WHERE status = 'REVIEWED'
  `;

  const total_result = await db.fetchData(total_query);
  const total_count = total_result ? total_result.total : 0;

  const doctor_query = `
    SELECT doctor_id, COUNT(*) AS count
    FROM appointment 
    WHERE status = 'REVIEWED'
    GROUP BY doctor_id
  `;

  const doctor_results = await db.fetchAllData(doctor_query);

  let doctor_counts = {};
  for (const row of doctor_results) {
    doctor_counts[row.doctor_id] = row.count;
  }

  return { total_count, doctor_counts };
}

async function fetch_doctor_clinic(doctor_id) {
  const query = `
    SELECT doctor_id, doctor, specialist, hospital, hospital_address 
    FROM doctor 
    WHERE doctor_id = ?
  `;

  return await db.fetchData(query, [doctor_id]);
}

async function fetchHospitals() {
  const query = `
    SELECT hospital_id, hospital_name 
    FROM clinic_login
  `;

  const results = await db.fetchAllData(query);
  console.log("Hospitals:", results);
  return results;
}

async function send_mail(subject, body, to_email) {
  try {
    const sender_email = process.env.SENDER_MAIL;
    const app_password = process.env.APP_PASSWORD; 

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // TLS
      auth: {
        user: sender_email,
        pass: app_password,
      },
    });

    const mailOptions = {
      from: sender_email,
      to: to_email,
      subject: subject,
      text: body,
    };

    await transporter.sendMail(mailOptions);

    console.log("Mail sent to:", to_email);
    return true;
  } 
  catch (err) {
    console.error("Error sending email:", err.message);
    return false;
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running at http://0.0.0.0:${PORT}`);
});