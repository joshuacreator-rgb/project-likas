import os
from flask import Flask, render_template, request, redirect, url_for, session, flash, send_file
from flask_mail import Mail
from models import db, User, Student, Attendance
from utils.email_service import send_absence_notification
from utils.export import export_csv
from utils.pdf_report import generate_pdf
from datetime import date, datetime
from functools import wraps
import re

# ─────────────────────────────────────────────
#  App Factory
# ─────────────────────────────────────────────
app = Flask(__name__)

# ── Core config ──────────────────────────────
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')

# ── Database: use env var if set (for Railway), else local SQLite ──
database_url = os.environ.get('DATABASE_URL', '')
if database_url:
    # Railway MySQL/Postgres URLs sometimes use mysql:// — SQLAlchemy needs mysql+pymysql://
    if database_url.startswith('mysql://'):
        database_url = database_url.replace('mysql://', 'mysql+pymysql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    # Local development: SQLite stored in instance/
    basedir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(basedir, 'instance', 'attendance.db')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ── Session security ─────────────────────────
app.config['SESSION_COOKIE_HTTPONLY']    = True
app.config['SESSION_COOKIE_SAMESITE']   = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 30 minutes

# ── Flask-Mail config (all from environment variables) ────────────
app.config['MAIL_SERVER']         = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT']           = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS']        = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
app.config['MAIL_USERNAME']       = os.environ.get('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD']       = os.environ.get('MAIL_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME', '')

# ── Init extensions ───────────────────────────
db.init_app(app)
mail = Mail(app)


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to continue.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def is_valid_email(email: str) -> bool:
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w{2,}$'
    return re.match(pattern, email) is not None


def get_today_summary():
    today = date.today()
    records = Attendance.query.filter_by(date=today).all()
    present = sum(1 for r in records if r.status == 'Present')
    absent  = sum(1 for r in records if r.status == 'Absent')
    late    = sum(1 for r in records if r.status == 'Late')
    return {'present': present, 'absent': absent, 'late': late, 'total': len(records)}


# ─────────────────────────────────────────────
#  Auth Routes
# ─────────────────────────────────────────────
@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        if not username or not password:
            flash('Username and password are required.', 'danger')
            return render_template('login.html')

        try:
            user = User.query.filter_by(username=username).first()
            if user and user.check_password(password):
                session.permanent = True
                session['user_id']  = user.id
                session['username'] = user.username
                flash(f'Welcome back, {user.username}!', 'success')
                return redirect(url_for('dashboard'))
            else:
                flash('Invalid username or password.', 'danger')
        except Exception as e:
            flash('An error occurred during login. Please try again.', 'danger')
            app.logger.error(f'Login error: {e}')

    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirm_password', '')

        errors = []
        if not username or len(username) < 3:
            errors.append('Username must be at least 3 characters.')
        if not is_valid_email(email):
            errors.append('Please enter a valid email address.')
        if len(password) < 6:
            errors.append('Password must be at least 6 characters.')
        if password != confirm:
            errors.append('Passwords do not match.')

        if errors:
            for err in errors:
                flash(err, 'danger')
            return render_template('register.html')

        try:
            if User.query.filter_by(username=username).first():
                flash('Username already exists. Please choose another.', 'warning')
                return render_template('register.html')
            if User.query.filter_by(email=email).first():
                flash('Email already registered. Please log in.', 'warning')
                return render_template('register.html')

            new_user = User(username=username, email=email)
            new_user.set_password(password)
            db.session.add(new_user)
            db.session.commit()
            flash('Account created successfully! Please log in.', 'success')
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            flash('Registration failed. Please try again.', 'danger')
            app.logger.error(f'Register error: {e}')

    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
#  Dashboard
# ─────────────────────────────────────────────
@app.route('/dashboard')
@login_required
def dashboard():
    try:
        students = Student.query.order_by(Student.name).all()
        today    = date.today()
        summary  = get_today_summary()

        today_records = {
            a.student_id: a.status
            for a in Attendance.query.filter_by(date=today).all()
        }

        return render_template(
            'dashboard.html',
            students=students,
            today=today,
            summary=summary,
            today_records=today_records,
            username=session.get('username')
        )
    except Exception as e:
        flash('Error loading dashboard.', 'danger')
        app.logger.error(f'Dashboard error: {e}')
        return render_template('dashboard.html', students=[], summary={}, today_records={},
                               today=date.today(), username=session.get('username'))


# ─────────────────────────────────────────────
#  Student Management
# ─────────────────────────────────────────────
@app.route('/students/add', methods=['POST'])
@login_required
def add_student():
    name  = request.form.get('name', '').strip()
    email = request.form.get('email', '').strip()

    if not name:
        flash('Student name is required.', 'danger')
        return redirect(url_for('dashboard'))

    if email and not is_valid_email(email):
        flash('Invalid email address format.', 'danger')
        return redirect(url_for('dashboard'))

    try:
        existing = Student.query.filter(
            db.func.lower(Student.name) == name.lower()
        ).first()
        if existing:
            flash(f'Student "{name}" already exists.', 'warning')
            return redirect(url_for('dashboard'))

        student = Student(name=name, email=email)
        db.session.add(student)
        db.session.commit()
        flash(f'Student "{name}" added successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Failed to add student. Please try again.', 'danger')
        app.logger.error(f'Add student error: {e}')

    return redirect(url_for('dashboard'))


@app.route('/students/delete/<int:student_id>', methods=['POST'])
@login_required
def delete_student(student_id):
    try:
        student = Student.query.get_or_404(student_id)
        Attendance.query.filter_by(student_id=student_id).delete()
        db.session.delete(student)
        db.session.commit()
        flash(f'Student "{student.name}" removed successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Failed to delete student.', 'danger')
        app.logger.error(f'Delete student error: {e}')

    return redirect(url_for('dashboard'))


# ─────────────────────────────────────────────
#  Attendance
# ─────────────────────────────────────────────
@app.route('/attendance/mark', methods=['POST'])
@login_required
def mark_attendance():
    today    = date.today()
    students = Student.query.all()
    marked   = 0
    skipped  = 0

    try:
        for student in students:
            status = request.form.get(f'status_{student.id}')
            if not status or status not in ('Present', 'Absent', 'Late'):
                continue

            existing = Attendance.query.filter_by(
                student_id=student.id, date=today
            ).first()

            if existing:
                existing.status = status
                skipped += 1
            else:
                record = Attendance(student_id=student.id, date=today, status=status)
                db.session.add(record)
                marked += 1

            if status == 'Absent' and student.email:
                try:
                    send_absence_notification(mail, student.name, student.email, today)
                except Exception as mail_err:
                    app.logger.warning(f'Email failed for {student.email}: {mail_err}')

        db.session.commit()
        flash(f'Attendance saved — {marked} new, {skipped} updated.', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Error saving attendance. Please try again.', 'danger')
        app.logger.error(f'Attendance mark error: {e}')

    return redirect(url_for('dashboard'))


@app.route('/attendance/history')
@login_required
def attendance_history():
    try:
        date_from    = request.args.get('date_from', '').strip()
        date_to      = request.args.get('date_to', '').strip()
        status       = request.args.get('status', '').strip()
        student_name = request.args.get('student_name', '').strip()

        query = (
            db.session.query(Attendance, Student)
            .join(Student, Attendance.student_id == Student.id)
        )

        if date_from:
            try:
                query = query.filter(Attendance.date >= datetime.strptime(date_from, '%Y-%m-%d').date())
            except ValueError:
                flash('Invalid "From Date" format.', 'warning')

        if date_to:
            try:
                query = query.filter(Attendance.date <= datetime.strptime(date_to, '%Y-%m-%d').date())
            except ValueError:
                flash('Invalid "To Date" format.', 'warning')

        if status and status in ('Present', 'Absent', 'Late'):
            query = query.filter(Attendance.status == status)

        if student_name:
            query = query.filter(Student.name.ilike(f'%{student_name}%'))

        records = query.order_by(Attendance.date.desc()).all()
        return render_template('history.html', records=records)
    except Exception as e:
        flash('Error loading attendance history.', 'danger')
        app.logger.error(f'History error: {e}')
        return redirect(url_for('dashboard'))


# ─────────────────────────────────────────────
#  Export Routes
# ─────────────────────────────────────────────
@app.route('/export/csv')
@login_required
def export_csv_route():
    try:
        filepath = export_csv()
        return send_file(filepath, as_attachment=True, download_name='attendance_report.csv')
    except Exception as e:
        flash('CSV export failed. Please try again.', 'danger')
        app.logger.error(f'CSV export error: {e}')
        return redirect(url_for('dashboard'))


@app.route('/export/pdf')
@login_required
def export_pdf_route():
    try:
        filepath = generate_pdf()
        return send_file(filepath, as_attachment=True, download_name='attendance_report.pdf')
    except Exception as e:
        flash('PDF export failed. Please try again.', 'danger')
        app.logger.error(f'PDF export error: {e}')
        return redirect(url_for('dashboard'))


# ─────────────────────────────────────────────
#  Init DB and Run
# ─────────────────────────────────────────────
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
