
import { Link, useParams } from 'react-router-dom';

const jobs = [
    {
        id: 1,
        title: 'Frontend Developer',
        company: 'Example Tech',
        location: 'Remote',
        description: 'Build modern and responsive web applications using React.'
    },
    {
        id: 2,
        title: 'Cybersecurity Analyst',
        company: 'Secure Systems',
        location: 'Chicago, IL',
        description: 'Monitor security threats and help protect company infrastructure.'
    },
    {
        id: 3,
        title: 'Software Engineer Intern',
        company: 'Future Software',
        location: 'Hybrid',
        description: 'Support software development, testing, and team collaboration.'
    }
];

function JobDetails() {
    const { id } = useParams();

    const job = jobs.find((job) => job.id === Number(id));

    if (!job) {
        return (
            <section>
                <h1>Job Not Found</h1>
                <Link to="/jobs">Back to Job Search</Link>
            </section>
        );
    }

    return (
        <section>
            <h1>{job.title}</h1>
            <h2>{job.company}</h2>
            <p><strong>Location:</strong> {job.location}</p>
            <p>{job.description}</p>

            <Link to="/jobs">Back to Job Search</Link>
        </section>
    );
}

export default JobDetails;
